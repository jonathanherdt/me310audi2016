module.exports = function (googleCalendar) {

    var module = {};

    module.getOrderedFutureCalendarEvents = function (auth, callback) {
         googleCalendar.events.list({
            auth: auth,
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime'
          }, function(err, response) {
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
                    if(event.start.dateTime && event.location){
                        cleanedUpEvents.push(event);
                    }
                }
                if(cleanedUpEvents.length > 0){
                    callback(cleanedUpEvents);
                }
                else {
                    console.error("No upcoming events with location and start time");
                }
            }
          });
    }

    return module;
};
