var socket = io.connect('', {
	query: 'id=' + getLocalIdentifier()
});


function buttonClicked() {
	socket.emit("app - create new user", getLocalIdentifier());
}

socket.on('app - go to url', function (url) {
	window.location.href = url;
});