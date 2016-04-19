var publicConfig = {
  key: 'AIzaSyBOtSjTEZWmOrMF1x9Tcp0YIalpOo_hX8A',
  secure:             true, // use https
};

var GoogleMapsAPI = require('googlemaps');
var gm = new GoogleMapsAPI( publicConfig );

exports.getDistanceToLocationFromCurrentPosition = function(latitude, longitude, mode, eventData, callback) {
    var parameters = {
        "key" : "AIzaSyBOtSjTEZWmOrMF1x9Tcp0YIalpOo_hX8A",
        "origins" : latitude + ',' + longitude,
        "destinations" : eventData.location,
        "departure_time" : new Date(eventData.start.dateTime).getTime(),
        "mode" : mode       
    };
   
    gm.distance(parameters, function(err, result) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        console.log(result.rows[0].elements[0]);
        callback(result.rows[0].elements[0]);
    });
}