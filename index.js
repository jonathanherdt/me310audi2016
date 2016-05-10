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
init();

// Clock connection
var clockSocket;

/* ------ ROUTING ------ */
// When the user gets back from the google authentication, display the connection page that gets updated dynamically (over sockets.io) once we received the calendar data
app.get('/back', function (req, res) {
	var code = req.query.code;
	var user_id = req.query.state;

	oauth2Client.getToken(code, function (err, tokens) {
		if (err) {
			console.log('The oauth2Client getToken returned an error: ' + err);
			return;
		}

		// Now tokens contains an access_token and an optional refresh_token. Save them.
		users[user_id] = {};
        users[user_id].calendar = [];
		users[user_id].tokens = tokens;
		oauth2Client.setCredentials(tokens);
		// Get user mail and send it to the client
		userinfo.userinfo.get({
			userId: 'me',
			auth: oauth2Client
		}, function (err, response) {
			if (err) {
				console.log('The userinfo API returned an error: ' + err);
				return;
			}
			// once this succeeds we assume a successful login and save some userdata
			users[user_id].email = response.email;
			users[user_id].name = response.name;
			users[user_id].picture = response.picture;
			users[user_id].signedOn = true;

			// the user's home address needs to be saved as well
			// TODO: specify that address in the app, send it to the server and turn it into lat/long there
			users[user_id].address = {lat: '52.392508', long: '13.123017'};

			console.log('new user ' + users[user_id].name + ' authenticated');

			storage.setItem('users', users);
		});
	});

	res.sendFile(__dirname + '/public/back.html');
});

/* ------ SOCKET CONNECTION ------ */
// A user connects over socket.io 
io.on('connection', function (socket) {

	//JSON.stringify(users, null, 4)
	var id = socket.handshake.query.id;

    // save socket for clock
    if (id === 'clock') clockSocket = socket;

	socket.on('app - create new user', function () {
		var googleAuthUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
			scope: scopes,
			state: id,
			approval_prompt: 'force' // so we receive an refresh_token every time
		});
		socket.emit('app - go to url', googleAuthUrl);
	});

	socket.on('check login state', function () {
		if (!users[id] || !users[id].signedOn) {
			console.log('request from not signed on user ' + id);
			socket.emit('user not authenticated', id);
			return;
		}

		socket.emit('user authenticated', users[id]);
	});

	socket.on('get calendar', function () {
		oauth2Client.setCredentials(users[id].tokens)
		console.log("get calendar");
		cal.getOrderedFutureCalendarEvents(oauth2Client, function eventListReceived(events) {
			// Once events are received, use sockets.io to send them to the frontend, 
			socket.emit('next event', events[0]);
		});
	})

	socket.on('app - get users', function () {
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
			oauth2Client.setCredentials(users[userID].tokens);
			cal.getCalendarEventsForTwoDays(oauth2Client, userID, data.day, function (userID, events) {
				if (events.length > 0) {
                    createCalendarWithTransitInformation(userID, events, function calendarCreated(calendar) {
                        //console.log(JSON.stringify(calendar.events, null, 4));
                        socket.emit('clock - calendar update', calendar);
                    });
				}
			});
		}
	});
    
    /* ------ CAR SIMULATOR REQUESTS ------ */

	socket.on('updateBattery', function (data) {
		console.log('[Car Simulator Data] Battery Level: ' + data);
		clockSocket.emit('[Car Simulator Data] - Battery Update', data);
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

    if (userId == "undefined") return;
    oauth2Client.setCredentials(users[userId].tokens);
    cal.getCalendarEventsForTwoDays(oauth2Client, userId, Date.now(), function (userId, events) {
        if (users[userId].calendar.length == 0) {
            users[userId].calendar = events;
        } else if (calendarChanged(users[userId].calendar, events)) {
            users[userId].calendar = events;
            console.log("Calendar of " + users[userId].name + " changed");
            createCalendarWithTransitInformation(userId, users[userId].calendar, function calendarCreated(calendar) {
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
    if (oldCal.length!= newCal.length) return true;
    for (var i = 0; i < oldCal.length; i++) {
        var oldEvent = oldCal[i];
        var matchingEventFound = false;
        for (var j = 0; j < newCal.length; j++) {
            var newEvent = newCal[j];
            if (oldEvent.start.getTime() === newEvent.start.getTime() &&
                oldEvent.end.getTime() === newEvent.end.getTime() &&
                oldEvent.title == newEvent.title &&
                oldEvent.location == newEvent.location) {
                matchingEventFound = true;
            }
        };
        if (matchingEventFound == false) return true;
    }
    return false;
};

function createCalendarWithTransitInformation(userID, events, callback) {
    // add transit information to each events
    var eventsEnrichedWithTransit = 0;
    events.forEach(function(event) {
        maps.addTransitInformationToEvent(event, userID, users[userID].address, function() {
            eventsEnrichedWithTransit++;

            // once all events have been enriched with transit info, send them to the clock
            if (eventsEnrichedWithTransit == events.length) {
                // TODO pick the best transit option from the transit information that is now saved
                findOptimalTransitForEvents(events);

                // create a calendar object and add user information to it
                var calendar = {
                    events: events,
                    name: users[userID].name,
                    email: users[userID].email,
                    picture: users[userID].picture,
                    carSimulatorData: {
                        batteryLevel: batteryLevel
                    }
                };
                callback(calendar);
            }
        });
    });
};

/**
 * Enrich each event with information about the optimal and second-best transit
 * TODO for now it simply picks the fastest options
 * @param events event-list
 */
function findOptimalTransitForEvents(events) {
    for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var fastest, secondFastest;

        // go through all transit options and find save the fastest and second fastest one
        for (var key in event.transit_options) {
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
        }

        // save the fastest and second fastest transit options with the event
        if (fastest != undefined) {
            events[i].optimized_transit = {
                best: fastest,
                alternative: secondFastest
            };
        }
    }
};

http.listen(8080, function () {
	console.log('listening on ' + (process.env.NODE_ENV == 'production' ? 'http://mtin.de:8080/' : 'http://localhost:8080/'));
});

