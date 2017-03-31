$(document).ready(function() {
	$("#button").click(function() {
		chrome.storage.local.clear();
		alert("Storage cleared!");
	});
});