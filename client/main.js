var $ = require('jquery');
var path = require('path');
var client_lib = require("./client.js");

$(document).ready(function(){
    var client = new client_lib.Client();
    client.connect();
});
