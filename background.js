// Send message when tab is updated
chrome.tabs.onUpdated.addListener(function (tab) {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var activeTab = tabs[0];
		chrome.tabs.sendMessage(activeTab.id, {"message": activeTab.url});
	});
});