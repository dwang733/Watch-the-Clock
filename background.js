"use strict";

/****************** EVENTS *********************/

// Fires when new page is loaded
chrome.webNavigation.onCompleted.addListener(details => {
	// Only occurs if page is fully loaded
	if (details.frameId === 0) {
		console.log(`Loading new page!`);
		// Make sure we are actually seeing the new page 
		// E.g. Open link in new tab will not trigger updateTime()
		chrome.tabs.query({currentWindow: true, active: true}, tabs => {
			// Check if newly loaded page is actually on this tab
			if (tabs.length > 0 && tabs[0].id === details.tabId) {
				console.log(`Loaded on current tab!`);
				updateTime(getTLD(tabs[0].url));
			}
			else {
				console.log(`Loaded elsewhere (new tab, etc.)!`);
				console.log(`---------------------------------`);
			}
		});
	}
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(activeInfo => {
	console.log(`New active tab!`);
	chrome.tabs.get(activeInfo.tabId, tab => {
		if (tab.status === "complete") {
			updateWithCurrentTab();
			chrome.runtime.sendMessage({greeting: "update"}, function(response) {
				console.log(response);
			});
		}
		else {
			console.log(`Tab still loading.`);
			updateTime(undefined);
		}
	});
});

// chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
// 	console.log(request + " " + sender);
// 	sendResponse({farewell: "goodbye"});
// });

// Fires when window changes focus (or no window is in focus)
chrome.windows.onFocusChanged.addListener(windowId => {
	// If no windows are in focus, stop time tracking
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		console.log(`Chrome unfocused!`);
		updateTime(undefined);
	}
	// Get active tab in newly focused window
	else {
		console.log(`Chrome changed focus!`);
		updateWithCurrentTab();
	}
});

// Detect if user is idle or not
chrome.idle.onStateChanged.addListener(newState => {
	console.log(`Machine is ${newState}`);
	// Stop time tracking if machine is idle/locked
	// If it turns active again, it'll either be unfocused and nothing happens,
	// or it will be focused and trigger one of the above events
	if (newState !== "active") {
		updateTime(undefined);
	}
});

// Set time interval when user is active.
chrome.runtime.onInstalled.addListener(details => {
	chrome.idle.setDetectionInterval(300);
});


/****************** TIME TRACKING ******************/

// Find previous URL visited and add time spent
// Also set previous URL and time to current URL and time
// Note that thisURL is undefined if we want to stop time tracking
function updateTime(thisURL) {
	safeMemoryOp(chrome.storage.local.get, ["prevStart", "prevURLStr"])
		.then(prev => {
			const prevStart = prev["prevStart"];
			const prevURL = prev["prevURLStr"];
			console.log(`New URL: ${thisURL}`);
			console.log(`Prev URL: ${prevURL}`);
			return Promise.all([prevStart, prevURL, 
				safeMemoryOp(chrome.storage.local.get, prevURL)]);
		}).then(results => {
			const currTime = new Date().getTime();
			let [prevStart, prevURL, prevURLTime] = results;
			// If no previous time spent, set it to 0
			prevURLTime = prevURLTime[prevURL] ? prevURLTime[prevURL] : 0;
			// Note: If a value is undefined, it's not stored
			const setObj = {
				"prevStart": currTime,
				"prevURLStr": thisURL
			};
			// Only add time if there is a prev URL
			if (prevURL) {
				const timeSpent = (currTime - prevStart) / 1000;
				setObj[prevURL] = prevURLTime + timeSpent;
				console.log(`Time just spent on prev URL: ${timeSpent}`);
			}
			return safeMemoryOp(chrome.storage.local.set, setObj);
		}).then(() => {
			if (!thisURL) {
				console.log("Deleting prev variables.");
				return Promise.all([
					safeMemoryOp(chrome.storage.local.remove, "prevURLStr"),
					safeMemoryOp(chrome.storage.local.remove, "prevStart")]);
			}
		}).then(() => {
			// Keep tracking time
			if (thisURL) {
				console.log(`Setting alarm.`);
				chrome.alarms.create("Update Time", {"delayInMinutes": 1});
				// console.log(`Dumping storage from focus!`);
				// printStorage();
				console.log(`---------------------------------`);
			}
			else {
				console.log(`Cleared alarm.`);
				chrome.alarms.clear("Update Time");
				// console.log(`Dumping storage from no focus!`);
				// printStorage();
				console.log(`---------------------------------`);
			}
		}).catch(error => console.error(error));
}

// Update time when alarm called
chrome.alarms.onAlarm.addListener(alarm => {
    console.log(`Update from alarm at ${new Date().toLocaleTimeString()}`);
    updateWithCurrentTab();
});

/**************** HELPER FUNCTIONS ******************/

// Get top level domain name
// E.g. http://store.google.com/xyz -> http://store.google.com
function getTLD(thisURL) {
    const regex = /^(\S+:\/\/[^\/]+).*$/;
	return thisURL.match(regex)[1];
}

// function printStorage() {
// 	safeMemoryOp(chrome.storage.local.get, null)
// 		.then(items => {
// 			for (const i in items) {
// 				console.log(`Key: ${i}		Value: ${items[i]}`);
// 			}
// 			console.log("---------------------------------");
// 		}).catch(error => console.error(error));
// }

chrome.storage.onChanged.addListener((changes, areaName) => {
	for (const i in changes) {
		console.log(`Key: ${i} \n` + `oldValue: ${changes[i]["oldValue"]} \n` +
			`newValue: ${changes[i]["newValue"]}`);
	}
});

// Performs the memory op with the given arg and checks that it succeeded
function safeMemoryOp(op, arg) {
	return new Promise((resolve, reject) => {
		op(arg, items => chrome.runtime.lastError ? 
			reject(Error(chrome.runtime.lastError.message)) : resolve(items));
	});
}

// Pass URL in current tab to updateTime()
function updateWithCurrentTab() {
	chrome.tabs.query({currentWindow: true, active: true}, 
		tab => updateTime(getTLD(tab[0].url)));
}