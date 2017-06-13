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
			if (tabs.length > 0 && tabs[0].id === details.tabId) {
				console.log(`Loaded on current tab!`);
				updateTime(getTLD(tabs[0].url));
			} else {
				console.log(`Loaded elsewhere (new tab, etc.)!`);
				console.log(`---------------------------------`);
			}
		});
	}
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(activeInfo => {
	chrome.tabs.get(activeInfo.tabId, tab => {
		// If window is closing, just ignore here.
		if (!chrome.runtime.lastError) {
			console.log(`New active tab!`);
			if (tab.status === "complete") {
				updateWithCurrentTab();
			} else {
				console.log(`Tab still loading.`);
				updateTime(undefined);
			}
		}
	});
});

// Fires when window changes focus (or no window is in focus)
chrome.windows.onFocusChanged.addListener(windowId => {
	// If no windows are in focus, stop time tracking
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		console.log(`Chrome unfocused!`);
		updateTime(undefined);
	} else {
		console.log(`Chrome changed focus!`);
		updateWithCurrentTab();
	}
});

// Detect if user is idle or not
// We don't track if machine becomes active again.
// If it turns active again, it'll either be unfocused and nothing happens,
// or it will be focused and trigger one of the above events
chrome.idle.onStateChanged.addListener(newState => {
	console.log(`Machine is ${newState}`);
	// Stop time tracking if machine is idle/locked
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
			// If website is new, set previous time spent on it to 0.
			return Promise.all([prevStart, prevURL, 
				safeMemoryOp(chrome.storage.local.get, {[prevURL]: 0})]);
		}).then(results => {
			const [prevStart, prevURL, prevURLResult] = results;
			const prevURLTime = prevURLResult[prevURL];
			const currTime = new Date().getTime();
			// If a value is undefined, it's not stored
			const setObj = {
				"prevStart": currTime,
				"prevURLStr": thisURL
			};
			const timeSpent = (currTime - prevStart) / 1000;
			console.log(`Time just spent on prev URL: ${timeSpent}`);
			const alarmTime = 60;
			// Only add time if there is a prev URL
			// If time spent is more than alarm time, just ignore it (chrome probably closed)
			if (prevURL && timeSpent < alarmTime * 1.5) {
				setObj[prevURL] = prevURLTime + timeSpent;
			}
			return safeMemoryOp(chrome.storage.local.set, setObj);
		}).then(() => {
			if (!thisURL) {
				console.log("Deleting prev variables.");
				return Promise.all([
					safeMemoryOp(chrome.storage.local.remove, "prevStart"),
					safeMemoryOp(chrome.storage.local.remove, "prevURLStr")]);
			}
		}).then(() => {
			// Keep tracking time
			if (thisURL) {
				console.log(`Setting alarm.`);
				chrome.alarms.create("Update Time", {"delayInMinutes": 1});
				console.log(`---------------------------------`);
			}
			else {
				console.log(`Cleared alarm.`);
				chrome.alarms.clear("Update Time");
				console.log(`---------------------------------`);
			}
		}).catch(error => console.error(error));
}

// Update time when alarm called
chrome.alarms.onAlarm.addListener(alarm => {
    console.log(`Update from alarm at ${new Date().toLocaleTimeString()}`);
    updateWithCurrentTab();
});

/**************** HELPER/DEBUGGER FUNCTIONS ******************/

chrome.storage.onChanged.addListener((changes, areaName) => {
	for (const i in changes) {
		console.log(`Key: ${i} \n` + `oldValue: ${changes[i]["oldValue"]} \n` +
			`newValue: ${changes[i]["newValue"]}`);
	}
});

// Get top level domain name
// E.g. http://store.google.com/xyz -> http://store.google.com
function getTLD(thisURL) {
    const regex = /^(\S+?:\/\/[^\/]+).*$/;
	return thisURL.match(regex)[1];
}

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