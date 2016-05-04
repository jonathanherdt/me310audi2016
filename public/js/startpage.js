var socket = io.connect('', {
	query: 'id=' + getLocalIdentifier()
});


function buttonClicked() {
	socket.emit("app - create new user");
}

function userListClicked() {
	socket.emit("app - get users");
}

function loginClicked() {
	window.location.href = 'googleConnected.html';
}

socket.on('app - go to url', function (url) {
	window.location.href = url;
});

socket.on('user list', function (users) {

	var userlist = '';

	Object.keys(users).forEach(function (entry) {
		userlist += users[entry].name + ' (' + users[entry].email + '); ';
	});	

	$('#user-list').text(userlist);
	console.log(users);
});