"use strict";

$(document).ready(function() {
	$("#button").click(function() {
		chrome.storage.local.clear();
		alert("Storage cleared!");
	});
	
	chrome.storage.local.get(null, (sitesDict) => {
		let sites = Object.keys(sitesDict).map(key => [key, sitesDict[key]]);
		sites = sites.filter(row => row[0] != "prevURLStr" && row[0] != "prevStart");
		sites.sort((x, y) => y[1] - x[1]); // Sort from highest to lowest times
		const tbody = $("#tbody");
		for (let i = 0; i < sites.length; i++) {
			let prettyTime = ``;
			let seconds = sites[i][1];
			if (seconds >= 3600) {
				const hours = Math.floor(seconds/3600);
				prettyTime += `${hours}h `;
				seconds -= hours * 3600;
			}
			if (seconds >= 60) {
				const mins = Math.floor(seconds/60);
				prettyTime += `${mins}m `;
				seconds -= mins * 60;
			}
			prettyTime += `${Math.floor(seconds)}s`;
			const tr = $(`<tr>`).appendTo(tbody);
			tr.append(`<td> ${sites[i][0]} </td> <td> ${prettyTime} </td>`);
		}
	});
});