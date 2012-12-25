
/**
 * Module dependencies.
 */

var express = require('express'),
    //routes = require('./routes'),
    http = require('http'),
    path = require('path'),
    redis,
    Cache;

// How long we keep weather data in cache
var WEATHER_CACHE_TTL = 60*15;

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

app.get('/w', function(req, res) {
  var weatherUrl = req.query.url;

  if(!weatherUrl) {
    return res.send(400);
  }

  weatherUrl = weatherUrl.replace('http://', '');

  Cache.getOrFetch(weatherUrl, function(err, xml) {
    if(err) {
      res.send("TODO: Proper err response");
    }
    res.send(xml);
  });
});


// Create server
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
  Cache.initialize();
});


// YR Client
YR = {

  fetch: function(url, cb) {
    http.get(this.parseUrl(url), function(res) {
      var str = '';
      res.on('data', function (chunk) {
        str += chunk;
      });
    
      res.on('end', function () {
        Cache.set(url, str);
        cb.call(this, undefined, str);
      });

      res.on('error', function () {
        cb.call(this, "Could not fetch data from yr.no");
      });
    
    }).end();
  },

  parseUrl: function(url) {
    return {
      host: 'www.yr.no',
      path: url.slice(url.indexOf('/'), url.length)
    };
  }

};

// Redis

Cache = {
  
  initialize: function() {
    if (process.env.REDISTOGO_URL) {
      var rtg = require("url").parse(process.env.REDISTOGO_URL);
      redis = require("redis").createClient(rtg.port, rtg.hostname);
      redis.auth(rtg.auth.split(":")[1]);
    } else {
      redis = require("redis").createClient();
    }
  },

  getOrFetch: function(key, cb) {
    redis.get(key, function(err, value) {
      if(!value) {
        YR.fetch(key, cb);
      } else {
        cb.call(this, undefined, value);
      }
    });
  },

  set: function(key, value) {
    redis.set(key, value, function() {
      redis.expire(key, WEATHER_CACHE_TTL);
    });
  }

};
