var socket = io();

// Receive calendar update from server and display it
 socket.on('next event', function(event){
    $('#next-event-name').text(event.summary);
	$('#next-event-time').text(event.start.dateTime);
  });