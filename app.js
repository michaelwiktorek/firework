'use strict';

var express = require('express');
var path = require('path');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var game = require(path.join(__dirname, 'server/game.js'));
var connection = require(path.join(__dirname, 'server/connection.js'));

// --- Global game list and ID generator ---
var data = {games: {}, id_incr: 1};
// games:   game_id    -> {model: Game object, players: {playername: socket}}
// id_incr: id increment generator

// --- Express Routes ---
app.use(express.static('public'));

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public/html/client.html'));
});

app.get('/[0-9]+', function(req, res) {
    // TODO use a template engine?
    res.sendFile(path.join(__dirname, 'public/html/client.html'));
});

app.get('/error', function(req, res) {
    res.sendFile(path.join(__dirname, 'public/html/error.html'));
});


// --- Websocket IO ---
io.on('connection', function(socket) {
    var playername = "unknown";
    // IO has multiple Connections in closure,
    // each Connection has a board, which has players and cards
    // the Connections associated with a single game_id
    // have a single Game model which they all share and query
    // in response to events
    var conn = new connection.Connection(playername, socket, data);
    conn.init_handlers();
});

http.listen(3322, function() {
    console.log('Firework listening on port 3322')
});
