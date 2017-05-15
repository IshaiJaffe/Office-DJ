var express = require('express')
  ,app = express()
  ,webhook = require('express-ifttt-webhook')
  ,exec = require('child_process').exec
  ,_ = require('lodash')
  ,fs = require('fs');


exec('bash ~/backup.sh');
var persistanceText = '{}';
var playlistText = '';
try{
  persistanceText = fs.readFileSync('./queue.json','utf8');  
}
catch(e){
}
try{
   playlistText = fs.readFileSync('./playlist.txt','utf8');
}
catch(e){}
var Url = require('url');
var QueryString = require('querystring');

function getYTId(url){
	try{
       return QueryString.parse(Url.parse(url).query || '').v || Url.parse(url).pathname.split('/')[1] || url;
    }
    catch(e){
       return url;
    }    
}

var shuffleList = _(playlistText.split('\n')).map(getYTId).uniq().compact().valueOf();


console.log('shuffle playlist',shuffleList.length);

var persistance = JSON.parse(persistanceText);


var DownloadQueue = persistance.down || [];

var PlayQueue = persistance.play || [];

var playingRadio = false;

var nowDownloading = false;
var nowPlaying = false, playingRocky = false;
var currentFile = '', currentURL = '';

var playingChild = null;

process.on('uncaughtException', function (e){
   console.error(e.stack || e.message);
});

app.use(webhook(function(json,done){
   console.log(JSON.stringify(json));
   done();
   playRocky();
}));

app.get('/rocky',function(req,res){  
   res.send('OK');
   playRocky(req.query.song);
});

app.get('/kill',function(req,res){
   playingRadio = false;
   exec('bash ' + __dirname + '/../killVLC');
   removeFromPlaylist(currentURL);
   res.send('OK');
});

function playSong(file){
   console.log('cvlc --play-and-exit --vout none ' + __dirname + '/' + file);
   playingRocky = true;
   exec('bash ' + __dirname + '/kill.sh',function() { 
  
      var child = exec('cvlc --play-and-exit --vout none ' + __dirname + '/' +  file,function(err,stdout,stderr) {
         playingRocky = false;
         processQueue();
      });
      setTimeout(function() {
         console.log('enough');
         //child.kill('SIGKILL');
         exec('bash ' + __dirname + '/kill.sh');
      },50000);
   });
   playingChild = null;
   exec('vol 80');
}

function playRocky(song) { 
   if(!song || song == 'null' || song == 'undefined')
       return playSong('rockey.mp3');
   console.log('win',song);
   var id = getYTId(song);
   console.log('naked',id);
   var filename = id + '.opus';
   if(fs.existsSync(__dirname + '/' + filename))
       return playSong(filename);
   console.log('downloading');
    var child = exec('youtube-dl --extract-audio --audio-format opus -o ' + __dirname + '/' + filename + ' ' + song,function(err,stdout,stderr) {
        playSong(filename);
    });
    child.stdout.on('data',function(chunk) { process.stdout.write(chunk); });
    child.stderr.on('data',function(chunk) { process.stderr.write(chunk); });      
}

app.get('/',function(req,res){
   var url = req.query.url;
   if(url){
       DownloadQueue.push(url);
       processQueue();
       fs.appendFile('playlist.txt','\n' + url,function(err){ err && console.error(err); });
       return res.redirect('/');
   }
   var isInside = req.headers.host && req.headers.host.indexOf('10.0.0.27')>-1;

   res.header('Content-Type','text/html');
   res.write('<html><body>');
   res.write('<form method="get">');
   res.write('<input type="url" name="url" />');
   res.write('<button type="submit">Add</button>');
   if(currentFile && !isInside){
       res.write('<audio controls' + (req.query.autoStart ? ' autoplay'  : '' ) + '><source src="/' + currentFile.split('/')[2] + '" type="audio/ogg; codecs=opus">Your browser does not support the audio element.</audio>');
   }
   res.write('</form>');
   if(currentURL){	  
        var list = [currentURL];
		PlayQueue.slice(0,1).forEach(function(pack){
			list.push(pack[1]);
		});
        res.write('<ul style="list-style:none">');
			list.forEach(function(url){
	            res.write('<li style="float:left;"><iframe width="280" height="158" src="https://www.youtube.com/embed/' + getYTId(url) + '?rel=0&amp;controls=0&autoplay=false" frameborder="0" allowfullscreen></iframe></li>');				
			});
		var length = PlayQueue.length - 1 + DownloadQueue.length;
	   res.write('</ul><div style="clear:both;">And ' + (length > 0 ? length + ' more...' : 'Thats it') + '</div>');
   }
   if(isInside) {
      res.write('<form method="get" action="/vol" target="vol">');
      res.write('<input type="submit" name="up" value="+" />');
      res.write('<input type="submit" name="down" value="-" />');
      res.write('</form>');  
      res.write('<form method="get" action="/kill" target="vol">');
      res.write('<button type="submit">Kill song</button>');
      res.write('</form>');
      res.write('<form method="get" action="/radio" target="vol"><h1>Radio</h1>');
      res.write('<input type="submit" name="station" value="GLGLZ" />');
      res.write('<input type="submit" name="station" value="99" />');
      res.write('<input type="submit" name="station" value="88" />');
      res.write('<input type="submit" name="station" value="Kol HaCampus" />');
      res.write('</form>');
      res.write('<iframe style="display:none;" name="vol" id="vol"></iframe>');      
   }
   res.write('<script>');
   if(req.query.autoStart && !currentFile)
      res.write('setTimeout(function() { location.reload(); },10000); ');
   res.write('var a = document.querySelector("audio"); a && a.addEventListener("ended", function(){ location.href="/?autoStart=true"; }); ');  
   res.write('</script>');
   if(isInside) {
       res.write("<script>  (function() {    var cx = '007867662724383622163:alojiccw6ag';    var gcse = document.createElement('script');    gcse.type = 'text/javascript';    gcse.async = true;    gcse.src = 'https://cse.google.com/cse.js?cx=' + cx;    var s = document.getElementsByTagName('script')[0];    s.parentNode.insertBefore(gcse, s);  })();</script>");
       res.write("<div id='search' ><gcse:search gname='s1'></gcse:search></div>");
       res.write("<div id='results'><gcse:searchresults-only gname='s1' linkTarget='_blank'></gcse:searchresults-only></div>");
        res.write("<script>" + 
        "var handler = function(e) { document.querySelector('#vol').setAttribute('src','?url=' + encodeURIComponent(e.target.getAttribute('data-ctorig'))); e.preventDefault(); e.stopPropagation(); }; " + 
        " setInterval(function() { Array.prototype.forEach.call(document.querySelectorAll('.gsc-thumbnail-inside a.gs-title'),function(elm) { elm.removeEventListener('click',handler); elm.addEventListener('click',handler); });  var ad = document.querySelector('.gsc-adBlock'); if(ad) ad.style.display = 'none';  },500) </script>");
   }
   res.write('</body></html>');
   res.end();
});

app.get('/vol',function(req,res){
   if(req.query.up)
     exec('vol +');
   else if(req.query.down)
     exec('vol -');
   res.send('OK');   
});

var linkByStation = {
   99:"http://99.livecdn.biz/99fm_aac?1493015060739",
   GLGLZ:" http://glzwizzlv.bynetcdn.com/glglz_mp3?awCollectionId=misc&awEpisodeId=glglz",
   88:'http://ibala.vidnt.com:8000/iba_radio-88fmM',
   'Kol HaCampus':"http://106fm.livecdn.biz:7075/;stream.mp3?1493015275052"
};

app.get('/radio',function(req,res) { 
   console.log('radio',req.query.station);
   console.log('kill');
   exec('bash ' + __dirname + '/kill.sh',function() {    
      console.log('killed');
      var station = req.query.station || 'glglz';
      console.log('cvlc --vout none ' + linkByStation[station]);
      exec('cvlc --vout none ' + linkByStation[station]);
   });
   playingRadio = true;   
   res.send('OK');
});

app.use(express.static(__dirname + '/../Music'));

app.use(function(req,res,next){
  res.send('END');
});

app.listen(8080,function(err) {
   if(err)
     throw err;
   console.log('listening on port');
   processQueue();
});

var global = Date.now() % 1000;

function processQueue(){
    console.log('download queue',DownloadQueue);
    console.log('play queue',PlayQueue);
    if(!nowDownloading && DownloadQueue.length) { 
        var url = DownloadQueue.shift();
        var filename = '~/Music/file' + (++global) + '.opus';
        try{
            fs.unlinkSync(__dirname + '/../Music/file' + global + '.opus');
        }
        catch(ex) { console.error(ex.message); }
        console.log('youtube-dl --extract-audio --audio-format opus -o ' + filename + ' ' + url);
        nowDownloading = true;
	var child = exec('youtube-dl --extract-audio --audio-format opus -o ' + filename + ' ' + url,function(err,stdout,stderr) { 
           nowDownloading = false;
           if(!err)
	      PlayQueue.push([filename,url]);
           
           processQueue();
        });
        child.stdout.on('data',function(chunk) { process.stdout.write(chunk); });
        child.stderr.on('data',function(chunk) { process.stderr.write(chunk); });
    }
    if(!nowPlaying && !playingRocky && PlayQueue.length && !playingRadio){
        var item = PlayQueue.shift();
        var file = item[0];
        console.log('cvlc --audio-filter normvol --norm-max-level 2 --play-and-exit --vout none ' + file);
        nowPlaying = true;
        currentFile = file;
        currentURL = item[1];
        var child2 = exec('cvlc --play-and-exit --vout none ' + file,function(err,stdout,stderr) { 
           currentFile = '';
           playingChild = null;
           setTimeout(function() { fs.unlinkSync(__dirname + '/../Music/' + file.split('/')[2]); },1000*60*5);
           nowPlaying = false;
           processQueue(); 
        });
        child2.stdout.on('data',function(chunk) { process.stdout.write(chunk); });
        child2.stderr.on('data',function(chunk) { process.stderr.write(chunk); });
        playingChild = child2;
    }
    fs.writeFileSync('./queue.json',JSON.stringify({down:DownloadQueue,play:PlayQueue}));
}

function removeFromPlaylist(url){
   if(!url || !url.trim())
      return;
   var playlistStr = fs.readFileSync('./playlist.txt','utf8');    
   var lines = playlistStr.split('\n');
   lines = lines.filter(function(line) { 
       return line && line.indexOf(url) == -1;
   });
   fs.writeFileSync('./playlist.txt',lines.join('\n'),'utf8');
}

setInterval(function(){
   if(!nowPlaying && !nowDownloading && !playingRocky && !PlayQueue.length && !DownloadQueue.length && !playingRadio){      
       console.log('shuffle a song');
       var songIndex = Math.floor(Math.random()*shuffleList.length);
       console.log('song',songIndex);
       var song = shuffleList.splice(songIndex,1)[0];
       console.log(song);
       DownloadQueue.push(song);
       processQueue();
   }
},1000*5);
