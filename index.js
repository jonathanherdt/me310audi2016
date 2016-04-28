var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var google = require('googleapis');
var googleCal = google.calendar('v3');
var OAuth2 = google.auth.OAuth2;
var googleCredentials = require('./credentials/key.json');

var cal = require('./server/GoogleConnectors/googleCalendarConnector.js')(googleCal);
var maps = require('./server/GoogleConnectors/googleMapsConnector.js');

// Store user data
var users = {};

// Make javascript files public so they are available on client side
app.use('/js', express.static(__dirname + '/public/js'));

// On the start page, show index.html
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/public/index.html');
});

// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function (req, res) {
	var code = req.query.code;
	var user_id = req.query.state;

	users[user_id].oauth2Client.getToken(code, function (err, tokens) {
		// Now tokens contains an access_token and an optional refresh_token. Save them.
		if (!err) {
			users[user_id].oauth2Client.setCredentials(tokens);
			users[user_id].refresh_token = tokens.refresh_token;
		}
	});

	res.sendFile(__dirname + '/public/googleConnected.html');
});

// A user connects over socket.io 
io.on('connection', function (socket) {

	if (users[socket.handshake.query.id] == undefined) users[socket.handshake.query.id] = {};
	users[socket.handshake.query.id].socket = socket;

	socket.on('app - create new user', function (id) {
		var oauth2Client = new OAuth2(googleCredentials.web.client_id, googleCredentials.web.client_secret, googleCredentials.web.redirect_uris[0]);
		var googleAuthUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
			scope: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/userinfo.profile'],
			state: id
		});

		users[id].oauth2Client = oauth2Client;
		socket.emit('app - go to url', googleAuthUrl);
	});

	socket.on('get calendar', function (id) {
		var oauth2Client = users[id].oauth2Client;
		cal.getOrderedFutureCalendarEvents(oauth2Client, function eventListReceived(events) {
			// Once events are received, use sockets.io to send them to the frontend
			users[id].socket.emit('next event', events[0]);
		});
	})

	socket.on('get directions for event', function (id, latitude, longitude, eventData) {
		// Get data for four different modes of transportation
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'driving', eventData, function (data) {
			users[id].socket.emit('distance time calculated', data, '🚗');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'walking', eventData, function (data) {
			users[id].socket.emit('distance time calculated', data, '🏃');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'bicycling', eventData, function (data) {
			users[id].socket.emit('distance time calculated', data, '🚴');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'transit', eventData, function (data) {
			users[id].socket.emit('distance time calculated', data, '🚋');;
		});
	});
});

http.listen(8080, function () {
	console.log('listening on *:8080');
});