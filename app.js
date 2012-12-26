var express = require('express'),
    //routes = require('./routes'),
    http = require('http'),
    path = require('path'),
    xml2js = require('xml2js'),
    moment = require('moment'),
    redis,
    Cache,
    YR;

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
  res.render('index');
});

app.post('/', function(req, res){
  res.send('creating');
});

// Render weather widget wrapped in
// javascript document.write
app.get('/weather/widget', function(req, res) {
  var weatherUrl = req.query.url,
      type = req.query.type || "overview";

  res.send("Weather as a js widget with document.write etc...");
});

// Render weather widget as plain HTML
app.get('/weather', function(req, res) {
  var weatherUrl = req.query.url;

  if(!weatherUrl) {
    return res.send(400);
  }

  weatherUrl = weatherUrl.replace('http://', '');

  Cache.getOrFetch(weatherUrl, function(err, forecast) {
    if(err) {
      res.send(err);
    }
    res.render('weather', {forecast: forecast, num: 10, moment: moment});
  });
});



// Create server
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
  Cache.initialize();
  YR.initialize();
});



// YR client for fetching and parsing data from
// yr.no's web service.
YR = {

  initialize: function() {
    this.parser = new xml2js.Parser({ mergeAttrs: true, explicitArray: false });
  },

  // Fetch weather data from given url
  fetch: function(url, cb) {
    var that = this;

    http.get({
      host: 'www.yr.no',
      path: url.slice(url.indexOf('/'), url.length)
    }, onResponse).end();

    function onResponse(res) {
      var body = '';

      res.on('data', function (chunk) {
        body += chunk;
      });
    
      res.on('end', function () {
        that.xmlToJson(body, function(err, json) {
          if(err || json['error']) {
            cb.call(this, "Error: Could not parse XML from yr.no");
            return;
          }
          Cache.set(url, JSON.stringify(json));
          cb.call(this, undefined, json);
        });
      });

      res.on('error', function () {
        cb.call(this, "Could not fetch data from yr.no");
      });
    }
  },

  // Parse XML from yr.no into JSON format
  // that can be used when rendering the view.
  xmlToJson: function(xml, cb) {
    // TODO
    this.parser.parseString(xml, cb);
  }

};

// Redis cache.
// All entries in cache are set with TTL of minimum 10 min.
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
    redis.get(key, function(err, forecast) {
      if(!forecast) {
        YR.fetch(key, cb);
      } else {
        cb.call(this, undefined, JSON.parse(forecast));
      }
    });
  },

  set: function(key, value) {
    redis.set(key, value, function() {
      redis.expire(key, WEATHER_CACHE_TTL);
    });
  }

};
