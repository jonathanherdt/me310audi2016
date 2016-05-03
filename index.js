var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var storage = require('node-persist');

var google = require('googleapis');
var googleCal = google.calendar('v3');
var userinfo = google.oauth2('v2');
var OAuth2 = google.auth.OAuth2;
var googleCredentials = require('./credentials/key.json');

var cal = require('./server/GoogleConnectors/googleCalendarConnector.js')(googleCal);
var maps = require('./server/GoogleConnectors/googleMapsConnector.js');

// Store user data
storage.initSync();
var users = storage.getItem('users');
if (users == undefined) users = {};

for (userId in users) {
	console.log('loaded user ' + users[userId].email + ' ' + userId)
}

var oauth2Client = new OAuth2(googleCredentials.web.client_id, googleCredentials.web.client_secret, googleCredentials.web.redirect_uris[1]);
var scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar'
];

// Make javascript files public so they are available on client side
app.use('/js', express.static(__dirname + '/public/js'));
app.use('/', express.static(__dirname + '/public'));

// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function (req, res) {
	var code = req.query.code;
	var user_id = req.query.state;

	oauth2Client.getToken(code, function (err, tokens) {
		// Now tokens contains an access_token and an optional refresh_token. Save them.
		if (!err) {
			users[user_id].tokens = tokens;
			storage.setItem('users', users);
		} else {
			console.log("Error: " + err);
		}
	});

	res.sendFile(__dirname + '/public/googleConnected.html');
});

// A user connects over socket.io 
io.on('connection', function (socket) {

    //JSON.stringify(users, null, 4)
    var id = socket.handshake.query.id;
    if (users[id] == undefined) users[id] = {};

	socket.on('app - create new user', function () {
		var googleAuthUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
			scope: scopes,
			state: id,
			approval_prompt: 'force' // so we receive an refresh_token every time
		});
		socket.emit('app - go to url', googleAuthUrl);
	});

	socket.on('get calendar', function () {
		oauth2Client.setCredentials(users[id].tokens)
        console.log("get calendar");
		cal.getOrderedFutureCalendarEvents(oauth2Client, function eventListReceived(events) {
			// Once events are received, use sockets.io to send them to the frontend
			socket.emit('next event', events[0]);

			// Get user mail and send it to the client
			userinfo.userinfo.get({
				userId: 'me',
				auth: oauth2Client
			}, function (err, response) {
				users[id].email = response.email;
				users[id].name = response.name;
				users[id].picture = response.picture;

				storage.setItem('users', users);

				socket.emit('user name', users[id].name);
			});
		});
	})

	socket.on('app - get users', function () {
		var stripped_users = {};
		Object.keys(users).forEach(function(entry) {
    		stripped_users[entry] = {name: users[entry].name, email: users[entry].email, picture: users[entry].picture};
  		});
		socket.emit('user list', stripped_users);
	})


	socket.on('get directions for event', function (latitude, longitude, eventData) {
		// Get data for four different modes of transportation
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'driving', eventData, function (data) {
			socket.emit('distance time calculated', data, '🚗');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'walking', eventData, function (data) {
			socket.emit('distance time calculated', data, '🏃');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'bicycling', eventData, function (data) {
			socket.emit('distance time calculated', data, '🚴');
		});
		maps.getDistanceToLocationFromCurrentPosition(latitude, longitude, 'transit', eventData, function (data) {
			socket.emit('distance time calculated', data, '🚋');;
		});
	});
    
    /* ------ CLOCK REQUESTS ------ */
    socket.on('request calendars', function(day) {    
        // the clock requests the calendar for a specific day for all logged in users
        for (var userID in users) {
            if (userID == undefined) continue;
            oauth2Client.setCredentials(users[userID].tokens);
            if (oauth2Client == undefined) console.log('oauth2client undefined in request calendar');
            cal.getCalendarEventsForOneDay(oauth2Client, day, function(calendar) {
                if (calendar.length > 0) socket.emit('receive calendar', calendar);         
            }); 
        }       
    });
});

http.listen(8080, function () {
	console.log('listening on *:8080');
});