var request = require('request');

var host = 'https://maps.googleapis.com/',
	path_maps = 'maps/api/',
	path_distance = 'directions/json';

exports.getDistanceToLocationFromCurrentPosition = function (latitude, longitude, mode, eventData, callback) {
	var departure_time = Math.floor(new Date(eventData.start.dateTime).getTime()) / 1000;
	var request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + eventData.location + '&departure_time=' + departure_time + '&mode=' + mode + '&key=AIzaSyBOtSjTEZWmOrMF1x9Tcp0YIalpOo_hX8A';
	request(request_url, function (error, response, body) {
		directions = JSON.parse(body);
		//console.log(directions.routes[0].legs[0]);
		// example output: http://maps.googleapis.com/maps/api/directions/json?origin=52.496,13.358&departure_time=1461158373&destination=52.517,13.341&mode=transit
		if (directions.routes[0] == null) {
			console.log(directions);
		} else {
			callback(directions.routes[0].legs[0]);
		}
	});
}