var request = require('request');

var host = 'https://www.googleapis.com',
	path_calendar = '/calendar/v3/calendars/primary',
	path_eventlist = '/events';

exports.getOrdereFutureCalendarEvents = function(http, access_token, callback) {
	var request_url = host + path_calendar + path_eventlist + '?access_token=' + access_token + '&singleEvents=true&orderBy=startTime&timeMin=' + ISODateString(new Date());
	
	console.log("Requesting all future events: " + request_url);

	request(request_url, function (error, response, body) {
	  events = JSON.parse(body).items;
	  console.log(events);
	  callback(events);
	  // callback(JSON.stringify(events));
	});
}

// helper function to get google formatted date
function ISODateString(d){
 function pad(n){return n<10 ? '0'+n : n}
 return d.getUTCFullYear()+'-'
      + pad(d.getUTCMonth()+1)+'-'
      + pad(d.getUTCDate())+'T'
      + pad(d.getUTCHours())+':'
      + pad(d.getUTCMinutes())+':'
      + pad(d.getUTCSeconds())+'Z'
}
