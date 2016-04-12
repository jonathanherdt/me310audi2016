var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var google = require('googleapis');
var urlshortener = google.urlshortener('v1');
var OAuth2 = google.auth.OAuth2;
var googleCredentials = require('./credentials/key.json');

var cal = require('./googleCalendarConnector.js');

var oauth2Client = new OAuth2(googleCredentials.web.client_id, googleCredentials.web.client_secret, 'http://localhost:8080/back');
google.options({ auth: oauth2Client });

var googleAuthUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
  scope: 'https://www.googleapis.com/auth/calendar'
});


app.use('/', express.static(__dirname + '/resources'));
app.use('/js', express.static(__dirname + '/resources/js'));

// On the start page, directly redirect to the google authentication page
app.get('/start/', function(req, res){
	res.writeHead(301, {
		'Location': googleAuthUrl
	});
	res.end();
});

// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function(req, res) {
	res.sendFile(__dirname + '/resources/googleConnected.html');

	// Get auth token and then request future events from calendar
	oauth2Client.getToken(req.query.code, function(err, tokens) {
	  // Now tokens contains an access_token and an optional refresh_token. Save them.
	  if(!err) {
		oauth2Client.setCredentials(tokens);
		cal.getOrdereFutureCalendarEvents(http, tokens.access_token, function eventListReceived(events) {
			// Once events are received, use sockets.io to send them to the frontend
			io.emit('next event', events[0]);
		});
	  }
	});
});

io.on('connection', function(socket){
  console.log('A user connected');
});

http.listen(8080, function(){
  console.log('listening on *:8080');
});