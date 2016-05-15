/* ------ NODE MODULES ------ */
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

/* ------ LOCAL VARIABLES AND SETTINGS ------ */

// Make javascript and html files public so they are available on client side
app.use('/js', express.static(__dirname + '/public/js'));
app.use('/', express.static(__dirname + '/public'));

// Prepare oauth2-client
var redirect_uri = (process.env.NODE_ENV == 'production') ? 'http://mtin.de:8080/back' : 'http://localhost:8080/back';
var oauth2Client = new OAuth2(googleCredentials.web.client_id, googleCredentials.web.client_secret, redirect_uri);
var scopes = [
	'https://www.googleapis.com/auth/userinfo.email',
	'https://www.googleapis.com/auth/userinfo.profile',
	'https://www.googleapis.com/auth/calendar'
];

// At startup, restore user data 
var users = {};
var temporaryUsers = {};
init();

// Clock and simulator connection
var clockSocket;
var simulatorSocket;

// improved logging

console.logCopy = console.log.bind(console);
console.log = function() {
    if (arguments.length)
    {
        var timestamp = '[' + (new Date).toISOString() + '] ';
        if (arguments.length > 1) {
        	this.logCopy(timestamp, arguments);
        } else {
        	this.logCopy(timestamp, arguments[0]);
        }
    }
};

/* ------ ROUTING ------ */
// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function (req, res) {
	var code = req.query.code;
	var user_id = req.query.state;

	oauth2Client.getToken(code, function (err, tokens) {
		if (err) {
			console.log('The oauth2Client getToken returned an error: ' + err);
			delete temporaryUsers[user_id];
			return;
		}

		
		oauth2Client.setCredentials(tokens);

		// Get user mail and if succesful add user to user database
		userinfo.userinfo.get({
			userId: 'me',
			auth: oauth2Client
		}, function (err, response) {
			if (err) {
				console.log('The userinfo API returned an error: ' + err);
				delete temporaryUsers[user_id];
				return;
			}

			if (!temporaryUsers[user_id]) {
				console.log("error creating user, oauth successful but dont have saved socket/travelPreferences");
				delete temporaryUsers[user_id];
				return;
			}

			// once this succeeds we assume a successful login and save some userdata plus access tokens
			users[user_id] = {};
			users[user_id].tokens = tokens;
			users[user_id].email = response.email;
			users[user_id].name = response.name;
			users[user_id].picture = response.picture;
			users[user_id].travelPreferences = temporaryUsers[user_id].travelPreferences;

			// the user's home address needs to be saved as well
			// TODO: specify that address in the app, send it to the server and turn it into lat/long there
			users[user_id].address = {lat: '52.392508', long: '13.123017'};

            console.log('new user ' + users[user_id].name + ' (' + user_id + ') authenticated');

            // Save the calendar events for today and tomorrow for each user and start the updating cycle
            users[user_id].events = [];
            updateCalendarInformation(user_id);

            // store the user data
			storage.setItem('users', users);

			// notify client of successful login
			temporaryUsers[user_id].socket.emit('new user authenticated', users[user_id]);
			delete temporaryUsers[user_id];
		});
	});

	res.sendFile(__dirname + '/public/back.html');
});

/* ------ SOCKET CONNECTION ------ */
// A user connects over socket.io 
io.on('connection', function (socket) {

	//JSON.stringify(users, null, 4)
	var id = socket.handshake.query.id;

	console.log('socket with id ' + id + ' connected from ' + socket.request.connection.remoteAddress + '. (' + (users[id] ? users[id].email : '<unknown>') + ')');

    // save sockets
    if (id === 'clock') {
		clockSocket = socket;
	} else if (id === 'simulator') {
		simulatorSocket = socket;
	} else {
		// TODO this does not work like that yet
		//if (!users[id]) users[id] = {};
		//users[id].socket = socket;
	}
	// TODO (test user not defined yet-check)
	// TODO get transit info when user logged in from app

	socket.on('app - create new user', function (travelPreferences) {
		temporaryUsers[id] = {'socket': socket, 'travelPreferences': travelPreferences};
		var googleAuthUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
			scope: scopes,
			state: id,
			approval_prompt: 'force' // so we receive an refresh_token every time
		});
		socket.emit('app - go to url', googleAuthUrl);
	});

	function verifyLoggedOn(userId) {
		if (users[userId]) return true;

		console.log('request from not signed on user ' + userId);
		socket.emit('user not authenticated', userId);
		return false;
	}

	socket.on('check login state', function () {
		if (!verifyLoggedOn(id)) return;
		socket.emit('user authenticated', users[id]);
	});

	socket.on('get calendar', function () {
		if (!verifyLoggedOn(id)) return;
		oauth2Client.setCredentials(users[id].tokens)
		console.log("get calendar from " + users[id].email + " " + id);
		cal.getOrderedFutureCalendarEvents(oauth2Client, function eventListReceived(events) {
			// Once events are received, use sockets.io to send them to the frontend, 
			socket.emit('next event', events[0]);
		});
	})

	socket.on('app - get users', function () {
		console.log("command 'app - get users' from " + id);
		var stripped_users = {};
		Object.keys(users).forEach(function (entry) {
			stripped_users[entry] = {
				name: users[entry].name,
				email: users[entry].email,
				picture: users[entry].picture
			};
		});
		socket.emit('user list', stripped_users);
	})

	socket.on('delete user', function(userId) {
		console.log("deleting user " + (users[userId] ? users[userId].name : "<unknown>") + " " + userId);
		delete users[userId];
		storage.setItem('users', users);
		socket.emit('clock - user deleted', users[userId].name);
	});

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
	socket.on('clock - request all calendars', function (data) {
		// the clock requests the calendar for a specific day for all logged in users
		for (var userID in users) {
			if (userID == "undefined") continue;
			var events = users[userID].events;
			if (events.length > 0) {
				var calendar = createCalendarObjectFromEvents(events, userID);
				socket.emit('clock - calendar update', calendar);
			}
		}
	});
    
    /* ------ CAR SIMULATOR REQUESTS ------ */

	socket.on('updateBattery', function (data) {
		console.log('[Car Simulator Data] Battery Level: ' + data);
		clockSocket.emit('[Car Simulator Data] - Battery Update', data);
	});
	
	socket.on('updateOil', function (data) {
		console.log('[Car Simulator Data] Oil Level: ' + data);
		clockSocket.emit('[Car Simulator Data] - Oil Update', data);
	});

});

/* ------ START UP ------ */
function init() {
    // restore user data
    storage.initSync();
    users = storage.getItem('users');
    for (userId in users) {
        console.log('loaded user ' + users[userId].email + ' ' + userId)

        // update the calendar for each user
        updateCalendarInformation(userId);
    }

    if (users == undefined) users = {};
}

function updateCalendarInformation(userId) {
   // console.log("updating calendar for " + userId);

    if (userId == "undefined" || users[userId] == undefined) return;
    oauth2Client.setCredentials(users[userId].tokens);
    cal.getCalendarEventsForTwoDays(oauth2Client, userId, Date.now(), function (userId, events) {
		// user does not have a calendar yet
        if (users[userId].events !== undefined && users[userId].events.length == 0) {
			createCalendarWithTransitInformation(userId, events, function calendarCreated(calendar) {
				users[userId].events = calendar.events;
				storage.setItem('users', users);
				if (clockSocket !== undefined) clockSocket.emit('clock - calendar update', calendar);
			});
        } else if (calendarChanged(users[userId].events, events)) {
            console.log("Calendar of " + users[userId].name + " changed");
            createCalendarWithTransitInformation(userId, events, function calendarCreated(calendar) {
				users[userId].events = calendar.events;
				storage.setItem('users', users);
                if (clockSocket !== undefined) clockSocket.emit('clock - calendar update', calendar);
            });
        }

        // update calendar every 5 seconds
        setTimeout(function() {
            updateCalendarInformation(userId);
        }, 5000);
    });
};

/**
 * Returns whether the two calenders passed into the function contain the same events
 * @param oldCal
 * @param newCal
 * @returns {boolean}
 */
function calendarChanged(oldCal, newCal) {
    if (oldCal !== undefined && oldCal.length!= newCal.length) return true;
    if (oldCal !== undefined) {
		for (var i = 0; i < oldCal.length; i++) {
			var oldEvent = oldCal[i];
			var matchingEventFound = false;
			for (var j = 0; j < newCal.length; j++) {
				var newEvent = newCal[j];
				var startOld = Date.parse(oldEvent.start);
				var endOld = Date.parse(oldEvent.end);
				var startNew = Date.parse(newEvent.start);
				var endNew = Date.parse(newEvent.end);
				if (startOld === startNew &&
					endOld === endNew &&
					oldEvent.title == newEvent.title &&
					oldEvent.location == newEvent.location) {
					matchingEventFound = true;
				}
			};
			if (matchingEventFound == false) return true;
		}
	}
    return false;
};

function createCalendarWithTransitInformation(userID, events, callback) {
    // add transit information to each events
    var eventsEnrichedWithTransit = 0;
	events.forEach(function(event) {
        maps.addTransitInformationToEvent(event, users[userID].address, function() {
            eventsEnrichedWithTransit++;

            // once all events have been enriched with transit info, send them to the clock
            if (eventsEnrichedWithTransit == events.length) {
                // TODO pick the best transit option from the transit information that is now saved
                findOptimalTransitForEvents(events, userID);

                // create a calendar object and add user information to it
                var calendar = createCalendarObjectFromEvents(events, userID);
                callback(calendar);
            }
        });
    });
};

function createCalendarObjectFromEvents(events, userID) {
	var calendar = {
		events: events,
		name: users[userID].name,
		email: users[userID].email,
		picture: users[userID].picture
	};
	return calendar;
}

/**
 * Enrich each event with information about the optimal and second-best transit
 * TODO for now it simply picks the fastest options
 * @param events event-list
 */
function findOptimalTransitForEvents(events, userID) {
    for (var i = 0; i < events.length; i++) {
        var event = events[i];
        //var fastest, secondFastest;
		var firstChoice, secondChoice;

		// first choice
		switch (users[userID].travelPreferences[0]) {
			case "car": if (event.transit_options.car) firstChoice = {name: "car", duration: event.transit_options.car.duration}; break;
			case "publictransport": if (event.transit_options.subway) firstChoice = {name: "subway", duration: event.transit_options.subway.duration }; break;
			case "bike": if (event.transit_options.bicycle) firstChoice = {name: "bicycle", duration: event.transit_options.bicycle.duration }; break;
			case "walk": if (event.transit_options.walking) firstChoice = {name: "walk", duration: event.transit_options.walking.duration }; break;
		}

		// second choice
		switch (users[userID].travelPreferences[1]) {
			case "car": if (event.transit_options.car) secondChoice = {name: "car", duration: event.transit_options.car.duration}; break;
			case "publictransport": if (event.transit_options.subway) secondChoice = {name: "subway", duration: event.transit_options.subway.duration }; break;
			case "bike": if (event.transit_options.bicycle) secondChoice = {name: "bicycle", duration: event.transit_options.bicycle.duration }; break;
			case "walk": if (event.transit_options.walking) secondChoice = {name: "walk", duration: event.transit_options.walking.duration }; break;
		}

        // go through all transit options and chose the preferred transit options
		/*for (var key in event.transit_options) {
            if (event.transit_options.hasOwnProperty(key)) {
                var option = event.transit_options[key];

                if (fastest == undefined) {
                    fastest = {name: key, duration: option.duration};
                    continue;
                }
                if (option.duration < fastest.duration) {
                    secondFastest = {name: fastest.name, duration: fastest.duration};
                    fastest = {name: key, duration: option.duration};
                    continue;
                }
                if (secondFastest == undefined || option.duration < secondFastest.duration) {
                    secondFastest = {name: key, duration: option.duration};
                }
            }
        }*/

        // save the transit options with the event
        if (firstChoice != undefined) {
            events[i].optimized_transit = {
                best: firstChoice,
                alternative: secondChoice
            };
        }
    }
};

http.listen(8080, function () {
	console.log('listening on ' + (process.env.NODE_ENV == 'production' ? 'http://mtin.de:8080/' : 'http://localhost:8080/'));
});

