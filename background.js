/* TODO:
√ Make sure chrome.alarms works
- Add chrome.idle
- Display time data in popup. Figure out how to do this.

- Change alarm time to >1 min
*/


/****************** WEBSITE/FOCUS TRACKING *********************/

// Fires when new page is loaded
// Use webNavigation.onCompleted instead of tabs.onUpdated
// webNavigation needed for event page b/c event filters
chrome.webNavigation.onCompleted.addListener(function(details) {
	if (details.frameId === 0) {
		var tld = getTLD(details.url);
		saveTime(tld);
	}
});

// Fires when user switches tab
chrome.tabs.onActivated.addListener(function(activeInfo) {
	chrome.tabs.get(activeInfo.tabId, function(tab) {
		var tld = getTLD(tab.url);
		saveTime(tld);
	});
});

// Fires when window changes focus (or no window is in focus)
chrome.windows.onFocusChanged.addListener(function(windowId) {
	// No windows are in focus
	if (windowId == chrome.windows.WINDOW_ID_NONE) {
		console.log("Not focused");
		saveTime(undefined);
	}
	// Get active tab in newly focused window
	else {
		chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
			tld = getTLD(tab[0].url);
			saveTime(tld);
		});
	}
});

/****************** TIME TRACKING ******************/

// Find previous URL visited and add time spent
// Also set previous URL and time to current URL and time
function saveTime(thisURL) {
	chrome.storage.sync.get(["prevStart", "prevURL"], function(getItems) {
		console.log("New URL: " + thisURL);
		console.log("Previous URL: " + getItems["prevURL"]);
		var setObj = {};
		var currTime = new Date().getTime();
		var prevURL = getItems["prevURL"];
		var prevStart = getItems["prevStart"];

		chrome.storage.sync.get(prevURL, function(item) {
			if (prevURL !== undefined && prevStart !== undefined) {
				var prevURLTime = item[prevURL] === undefined ? 0 : item[prevURL];
				console.log("Total time spent on prev URL before: " + prevURLTime);
				setObj[prevURL] = prevURLTime + (currTime - prevStart) / 1000;
				console.log("Time just spent on prev URL: " + ((currTime - prevStart) / 1000));
			}
			setObj["prevStart"] = currTime;
			setObj["prevURL"] = thisURL;
			chrome.storage.sync.set(setObj, function() {
				// If thisURL is undefined (b/c no focus), manually remove "prevURL" and alarm
				if (thisURL === undefined) {
					chrome.storage.sync.remove("prevURL", function() {
						printStorage();
						console.log("Cleared alarm.");
						chrome.alarms.clear("Update Time");
					});
				}
				// Update time after certain interval
				else {
					printStorage();
					chrome.alarms.create("Update Time", {"delayInMinutes": 1/4});
				}
			});
		});
	});
}

// Update time when alarm called
chrome.alarms.onAlarm.addListener(function(alarm) {
	chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
		tld = getTLD(tab[0].url);
		console.log("Update from alarm.");
		saveTime(tld);
	});
});

/**************** HELPER FUNCTIONS ******************/
// Get top level domain name
// E.g. https://developer.chrome.com/extensions/storage -> https://developer.chrome.com
function getTLD(thisURL) {
	regex = /^(\w+:\/\/[^\/]+).*$/;
	return thisURL.match(regex)[1];
}

/******************** DEBUGGING ********************/

function printStorage() {
	chrome.storage.sync.get(null, function(items) {
		for (i in items) {
			console.log("Key: " + i + "		Value: " + items[i]);
		}
		console.log("---------------------------------");
	});
}