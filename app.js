
/**
 * Module dependencies.
 */

var express = require('express'),
    //routes = require('./routes'),
    http = require('http'),
    path = require('path'),
    redis;

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});


// Routes and handlers
app.get('/', function(req, res){
  res.render('index', { title: 'Express' });
});

app.post('/', function(req, res){
  res.send('creating');
});

app.get('/w/:location', function(req, res) {
  console.log('Will render location', req.params.location);



});


// Create server
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));

  if (process.env.REDISTOGO_URL) {
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    redis = require("redis").createClient(rtg.port, rtg.hostname);

    redis.auth(rtg.auth.split(":")[1]);
  } else {
    redis = require("redis").createClient();
  }

});
