var request = require('request');

var host = 'https://maps.googleapis.com/',
	path_maps = 'maps/api/',
	path_distance = 'directions/json';

var maps_key = 'AIzaSyBOtSjTEZWmOrMF1x9Tcp0YIalpOo_hX8A';

var count = 0;

exports.getDistanceToLocationFromCurrentPosition = function (latitude, longitude, mode, eventData, callback) {
	var departure_time = Math.floor(new Date(eventData.start.dateTime).getTime()) / 1000;
	var request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + eventData.location + '&departure_time=' + departure_time + '&mode=' + mode + '&key=' + maps_key;

	request(request_url, function (error, response, body) {
		//console.log(request_url);
		directions = JSON.parse(body);
		// example output: http://maps.googleapis.com/maps/api/directions/json?origin=52.496,13.358&departure_time=1461158373&destination=52.517,13.341&mode=transit
		if (directions.routes[0] == null) {
			console.log(directions);
		} else {
			callback(directions.routes[0].legs[0]);
		}
	});
}

exports.addTransitInformationToEvent = function (event, origin, callback) {
	var arrival_time = Math.floor(new Date(event.start).getTime()) / 1000;
    var latitude = origin.lat,longitude = origin.long;

	var car_request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + event.location + '&arrival_time=' + arrival_time + '&mode=driving&key=' + maps_key;
	var transit_request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + event.location + '&arrival_time=' + arrival_time + '&mode=transit&key=' + maps_key;
	var bike_request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + event.location + '&arrival_time=' + arrival_time + '&mode=bicycling&key=' + maps_key;
	var walk_request_url = host + path_maps + path_distance + '?origin=' + latitude + ',' + longitude + '&destination=' + event.location + '&arrival_time=' + arrival_time + '&mode=walking&key=' + maps_key;

	var requestsDone = 0;

    event.transit_options = {};

	request(car_request_url, function (error, response, body) {
		requestsDone++;
		count++;
		console.log("Maps request - " + count);
		directions = JSON.parse(body);
		if (directions.routes[0] == null) {
			console.log("Car routes are empty :'(");
		} else {
			var desc = directions.routes[0].legs[0];
			event.transit_options.car = {};
			event.transit_options.car.duration = desc.duration.value / 60;
			if (desc.duration_in_traffic !== undefined) event.transit_options.car.duration_with_traffic = desc.duration_in_traffic.value / 60;
		}
		if (requestsDone == 4) callback(event);
	});

	request(transit_request_url, function (error, response, body) {
		requestsDone++;
		count++;
		console.log("Maps request - " + count);
		directions = JSON.parse(body);
		if (directions.routes[0] == null) {
			console.log("Transit routes are empty :'(");
		} else {
			var desc = directions.routes[0].legs[0];
			event.transit_options.subway = {
				duration: desc.duration.value / 60,
				arrival_time: new Date(Date.parse(desc.arrival_time.value + "000"))
			}
		}
		if (requestsDone == 4) callback(event);
	});

	request(bike_request_url, function (error, response, body) {
		requestsDone++;
		count++;
		console.log("Maps request - " + count);
		if (error) {
			console.log("Error: " + error);
		} else {
			directions = JSON.parse(body);
			if (directions.routes[0] == null) {
				console.log("Bike routes are empty :'(");
			} else {
				var desc = directions.routes[0].legs[0];
				event.transit_options.bicycle = {
					duration: desc.duration.value / 60
				}
			}
		}
		if (requestsDone == 4) callback(event);
	});

	request(walk_request_url, function (error, response, body) {
		requestsDone++;
		count++;
		console.log("Maps request - " + count);
		directions = JSON.parse(body);
		if (directions.routes[0] == null) {
			console.log("Walking routes are empty :'(");
		} else {
			var desc = directions.routes[0].legs[0];
			event.transit_options.walking = {
				duration: desc.duration.value / 60
			}
		}
		if (requestsDone == 4) callback(event);
	});
}