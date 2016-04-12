var request = require('request');

var host = 'https://maps.googleapis.com/',
    path_maps = 'maps/api/',
    path_distance = 'distancematrix/json';

exports.getDistanceToLocationFromCurrentPosition = function(latitude, longitude, mode, eventData, callback) {
    var request_url = host + path_maps + path_distance + '?origins=' + latitude + ',' + longitude + '&destinations=' + eventData.location + '&departure_time=' + new Date(eventData.start.dateTime).getTime() + '&mode=' + mode + '&key=AIzaSyBOtSjTEZWmOrMF1x9Tcp0YIalpOo_hX8A';
    request(request_url, function (error, response, body) {
        directions = JSON.parse(body);
        callback(directions.rows[0].elements[0]);
    });
}