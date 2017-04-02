"use strict"

/****************** WEBSITE/FOCUS TRACKING *********************/

// Fires when new page is loaded
// Use webNavigation.onCompleted instead of tabs.onUpdated
// tabs.onUpdated fires multiple times when page is loaded (for some reason)
chrome.webNavigation.onCompleted.addListener(function(details) {
	// Only occurs if page is fully loaded
	if (details.frameId === 0) {
		console.log("Loading new page!");
		// Make sure we are actually seeing the new page 
		// E.g. Open link in new tab will not trigger updateTime()
		chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
			// Check if newly loaded page is actually on this tab
			if (tab.length > 0 && tab[0].url === details.url) {
				console.log("Loaded on current tab!");
				var tld = getTLD(details.url);
				updateTime(tld);
			} else if (tab.length === 0) {
				console.log("Loaded elsewhere in unfocused window!");
				console.log("---------------------------------");
			}
			else {
				console.log("Loaded elsewhere (new tab, etc.)!");
				console.log("---------------------------------");
			}
		});
	}
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(function(activeInfo) {
	console.log("Switched tabs!");
	updateWithCurrentTab();
});

// Fires when window changes focus (or no window is in focus)
chrome.windows.onFocusChanged.addListener(function(windowId) {
	// If no windows are in focus, stop time tracking
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		console.log("Chrome unfocused!");
		updateTime(undefined);
	}
	// Get active tab in newly focused window
	else {
		console.log("Chrome changed focus!");
		updateWithCurrentTab();
	}
});

// Detect if user is idle or not
chrome.idle.onStateChanged.addListener(function(newState) {
	console.log("Machine is " + newState);
	if(newState === "active") {
		updateWithCurrentTab();
	}
	// If idle or locked, stop time tracking
	else {
		updateTime(undefined);
	}R
});

// Set time interval when user is active.
chrome.runtime.onInstalled.addListener(function(details) {
	chrome.idle.setDetectionInterval(300);
});


/****************** TIME TRACKING ******************/

// Find previous URL visited and add time spent
// Also set previous URL and time to current URL and time
// Note that thisURL is undefined if we want to stop time tracking
function updateTime(thisURL) {
	safeMemoryOp(chrome.storage.local.get, ["prevStart", "prevURLStr"])
		.then(function(prev) {
			var prevStart = prev["prevStart"];
			var prevURL = prev["prevURLStr"];
			console.log("New URL: " + thisURL);
			console.log("Prev URL: " + prevURL);
			return Promise.all([prevStart, prevURL, safeMemoryOp(chrome.storage.local.get, prevURL)]);
		}).then(function(results) {
			var [prevStart, prevURL, prevURLTime] = results;
			// If no previous time spent, set it to 0
			prevURLTime = prevURLTime[prevURL] ? prevURLTime[prevURL] : 0;
			var currTime = new Date().getTime();
			var setObj = {
				"prevStart": currTime,
				"prevURLStr": thisURL
			};
			// Only add time if there is a prev URL
			if (prevStart && prevURL) {
				console.log("Time spent on prev URL before: " + prevURLTime);
				setObj[prevURL] = prevURLTime + (currTime - prevStart) / 1000;
				console.log("Time just spent on prev URL: " + ((currTime - prevStart) / 1000));
			}
			// setObj["prevStart"] = currTime;
			// setObj["prevURLStr"] = thisURL;
			return safeMemoryOp(chrome.storage.local.set, setObj);
		}).then(function() {
			if (!thisURL) {
				return safeMemoryOp(chrome.storage.local.remove, "prevURLStr");
			}
		}).then(function() {
			// Keep tracking time
			if (thisURL) {
				console.log("Dumping storage from focus!");
				printStorage();
				chrome.alarms.create("Update Time", {"delayInMinutes": 1});
			}
			else {
				console.log("Cleared alarm.")
				chrome.alarms.clear("Update Time");
				console.log("Dumping storage from no focus!");
				printStorage();
			}
		}).catch(function(error) {
			console.error(error);
		});
}

// Update time when alarm called
chrome.alarms.onAlarm.addListener(function(alarm) {
	console.log("Update from alarm at " + new Date().toLocaleTimeString());
	updateWithCurrentTab();
});


/**************** HELPER FUNCTIONS ******************/

// Get top level domain name
// E.g. https://developer.chrome.com/extensions/ -> https://developer.chrome.com
function getTLD(thisURL) {
	var regex = /^(\w+:\/\/[^\/]+).*$/;
	return thisURL.match(regex)[1];
}

function printStorage() {
	chrome.storage.local.get(null, function(items) {
		for (var i in items) {
			console.log("Key: " + i + "		Value: " + items[i]);
		}
		console.log("---------------------------------");
	});
}

// Pass URL in current tab to updateTime()
function updateWithCurrentTab() {
	chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
		var tld = getTLD(tab[0].url);
		updateTime(tld);
	});
}

// Performs the memory op with the given arg and checks that it succeeded
function safeMemoryOp(op, arg) {
	return new Promise(function(resolve, reject) {
		op(arg, function(items) {
			if (chrome.runtime.lastError) {
				reject(Error("Memory error"));
			}
			resolve(items);
		});
	});
}