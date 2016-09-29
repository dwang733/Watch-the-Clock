// Fires when new page is loaded
// Use webNavigation.onCompleted instead of tabs.onUpdated
// webNavigation needed for event page b/c event filters
chrome.webNavigation.onCompleted.addListener(function(details) {
	if (details.frameId === 0) {
		var tld = getTLD(details.url);
		console.log(tld);
		saveTime(tld);
	}
});

// Get top level domain name
// E.g. https://developer.chrome.com/extensions/storage -> https://developer.chrome.com
function getTLD(thisURL) {
	regex = /^(\w+:\/\/[^\/]+).*$/;
	return thisURL.match(regex)[1];
}

function saveTime(thisURL) {
	chrome.storage.sync.get(["prevStart", thisURL], function(getItems) {
		console.log(getItems["prevStart"] + " " + getItems[thisURL]);
		var setObj = {};
		var currTime = new Date().getTime();
		if (getItems["prevStart"] !== undefined) {
			var thisURLTime = getItems[thisURL] === undefined ? 0 : getItems[thisURL];
			setObj[thisURL] = thisURLTime + (currTime - getItems["prevStart"]) / 1000;
		}
		setObj["prevStart"] = currTime;
		chrome.storage.sync.set(setObj);
	});
}