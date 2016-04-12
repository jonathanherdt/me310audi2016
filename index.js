var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var google = require('googleapis');
var urlshortener = google.urlshortener('v1');
var OAuth2 = google.auth.OAuth2;
var googleCredentials = require('./credentials/key.json');

var cal  = require('./resources/js/GoogleConnectors/googleCalendarConnector.js');
var maps = require('./resources/js/GoogleConnectors/googleMapsConnector.js');

var oauth2Client = new OAuth2(googleCredentials.web.client_id, googleCredentials.web.client_secret, 'http://localhost:8080/back');
google.options({ auth: oauth2Client });

var googleAuthUrl = oauth2Client.generateAuthUrl({
	access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
	scope: 'https://www.googleapis.com/auth/calendar'
});

app.use('/js', express.static(__dirname + '/resources/js'));

// On the start page, directly redirect to the google authentication page
app.get('/', function(req, res){
	res.writeHead(301, {
		'Location': googleAuthUrl
	});
	res.end();
});

var code;

// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function(req, res) {
	code = req.query.code;
	res.sendFile(__dirname + '/resources/googleConnected.html');
});

io.on('connection', function(socket){
	socket.on('get calendar', function(){

		oauth2Client.getToken(code, function(err, tokens) {
			// Now tokens contains an access_token and an optional refresh_token. Save them.
			if(!err) {
				oauth2Client.setCredentials(tokens);
				cal.getOrderedFutureCalendarEvents(http, tokens.access_token, function eventListReceived(events) {
					// Once events are received, use sockets.io to send them to the frontend
					io.emit('next event', events[0]);
				});
			}
		});
	})

	socket.on('get directions for event', function(latitude, longitude, eventData){
		// Get data for four different modes of transportation
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'driving', eventData, function(data){
			io.emit('distance time calculated', data, '🚗');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'walking', eventData, function(data){
			io.emit('distance time calculated', data, '🏃');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'bicycling', eventData, function(data){
			io.emit('distance time calculated', data, '🚴');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'transit', eventData, function(data){
			io.emit('distance time calculated', data, '🚋');;
		});
	});
});

http.listen(8080, function(){
	console.log('listening on *:8080');
});