module.exports = function (googleCalendar) {

	var module = {};

	var maps = require('./googleMapsConnector.js');

	module.getOrderedFutureCalendarEvents = function (auth, callback) {
		googleCalendar.events.list({
			auth: auth,
			calendarId: 'primary',
			timeMin: (new Date()).toISOString(),
			maxResults: 10,
			singleEvents: true,
			orderBy: 'startTime'
		}, function (err, response) {
			if (err) {
				console.log('The API returned an error: ' + err);
				return;
			}
			var events = response.items;
			if (events.length == 0) {
				console.log('No upcoming events found.');
			} else {
				console.log('Upcoming 10 events:');
				var cleanedUpEvents = [];

				for (var i = 0; i < events.length; i++) {
					var event = events[i];
					var start = event.start.dateTime || event.start.date;
					console.log('%s - %s', start, event.summary);
					if (event.start.dateTime && event.location) {
						cleanedUpEvents.push(event);
					}
				}
				if (cleanedUpEvents.length > 0) {
					callback(cleanedUpEvents);
				} else {
					console.error("No upcoming events with location and start time");
				}
			}
		});
	}

	module.getCalendarEventsForOneDay = function (auth, userID, day, origin, callback) {
		var todayMidnight = new Date(Date.parse(day));
		todayMidnight.setHours(0, 0, 0, 0);
		var tomorrowMidnight = new Date(Date.parse(day));;
		tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
		tomorrowMidnight.setHours(0, 0, 0, 0);

		googleCalendar.events.list({
			auth: auth,
			calendarId: 'primary',
			timeMin: todayMidnight.toISOString(),
			timeMax: tomorrowMidnight.toISOString(),
			singleEvents: true,
			orderBy: 'startTime'
		}, function (err, response) {
			if (err) {
				console.log('The API returned an error: ' + err);
			}
			var events = response.items;
			if (events.length == 0) {
				console.log('No upcoming events found.');
			} else {
				var cleanedUpEvents = [];
				for (var i = 0; i < events.length; i++) {
					var event = events[i];
					var start = event.start.dateTime || event.start.date;

					// Retrieve all relevant information from the event and add transit data
					if (event.start.dateTime) {
						var cleanEvent = {
							start: new Date(Date.parse(event.start.dateTime)),
							end: new Date(Date.parse(event.end.dateTime)),
							location: event.location,
							title: event.summary
						};
						cleanedUpEvents.push(cleanEvent);
					}
				}

				// after adding the bare events, add transit information to each of them
				var eventsEnrichedWithTransit = 0;
				cleanedUpEvents.forEach(function (event) {
					maps.addTransitInformationToEvent(event, origin, function () {
						eventsEnrichedWithTransit++;
						// once all elements have been enriched with transit data, sent it back to the main index
						if (eventsEnrichedWithTransit == cleanedUpEvents.length) {
							callback(userID, cleanedUpEvents);
						}
					});
				});
				if (cleanedUpEvents.length <= 0) {
					console.error('No upcoming events with start time');
					callback(userID, cleanedUpEvents);
				}
			}
		});
	}

	return module;
};