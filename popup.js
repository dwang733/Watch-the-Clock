$(document).ready(function() {
	$("#button").click(function() {
		chrome.storage.sync.clear();
		alert("Storage cleared!");
	});
});