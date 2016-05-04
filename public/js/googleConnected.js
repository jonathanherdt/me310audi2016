var socket = io.connect('', {
	query: 'id=' + getLocalIdentifier()
});

// Receive calendar update from server and display it
socket.on('next event', function (event) {
	$('#next-event-name').text(event.summary);
	$('#next-event-time').text(event.start.dateTime + ' at ' + event.location + '.');

	// check whether browser supports geolocation api
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(positionSuccess, positionError, {
			enableHighAccuracy: true
		});
	} else {
		positionError();
	}

	function positionSuccess(position) {
		socket.emit('get directions for event', position.coords.latitude, position.coords.longitude, event);
	};

	function positionError() {
		$('#next-event-time').after('<br>Can\'t get location 🙁');
	}
});

socket.on('distance time calculated', function (result, mode) {
	var duration = result.duration_in_traffic ? result.duration_in_traffic.text : result.duration.text;
	$('#next-event-time').after("<br>🕘" + mode + " It will take you ~" + duration + " to get there.");
});

socket.on('user authenticated', function (user) {
	$('#user-name').text(user.name);
	socket.emit('get calendar');
})

socket.on('user not authenticated', function (id) {
	$('#user-name').text('<not yet authenticated> (did you forget to connect your google account?)');
	setTimeout(function () {
		socket.emit('check login state');
    }, 1000);
})

socket.emit('check login state');