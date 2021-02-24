/**
 * Pn=n! (2006) by Iván Marino
 * ES6 restoration for the media art installation developed in Macromedia Flash
 * Original work: http://www.ivan-marino.net/08/swf_as2/desastres/06.html (needs Adobe Flash Player)

 * @developer Marcelo Terreni (http://www.terreni.com.ar/)
 * @CSS + E6 + HandBrakeCLI
 * @date June 2020
**/


//=============================//
//     		CONFIG VALUES	    	 //
//=============================//
const videoSrcData = {
	total : 15,
	format: 'mp4',
	path : (window.matchMedia('(min-width: 769px)').matches) ? 'src/video/1200' : 'src/video/640',
	fantasyPath : 'pn',
	mimeCodec : 'video/mp4; codecs="avc1.4D4020"',
	bufferQuota : { //30MB Chromecast, 100MB Firefox, 150MB Chrome
		size : 30,
		browser : 'Chromecast'
	}
};


const videoArrays = [
	{ 
		role : 'judges',
		dir : 'judges', 
		fname : 't_', 
		files : []
	},{ 
		role : 'jeanne',
		dir : 'jeanne', 
		fname : 'j_',
		files : []
	},{ 
		role : 'machines',
		dir : 'machines',
		fname : 'm_',
		files : []
	}
];


//=================================//
//    GLOBALS USED BY CUECHANGE 	 //
//=================================//
const sequenceData = {
	sequence : [],
	duration : 0,
	cueDelay: -0.070,
	total: 0,
	remaining : 0,
	visible: 1
}


const init = () => {

	if ('MediaSource' in window && MediaSource.isTypeSupported(videoSrcData.mimeCodec)) {

		/* Fill videoArrays with file blobs (mutates original array) */	
		const loadingElements	= document.getElementsByClassName('intro-description-loading-list')[0].children;
		const loadPromise = loadVideoFiles(videoSrcData, videoArrays, loadingElements);
				
		loadPromise
			.then( data => {
			 	if(data === 'ready'){
			 		if(!document.getElementsByClassName('intro')[0].classList.contains('intro-off')){
			 			document.getElementsByClassName('pn')[0].classList.add('pn-ready');
			 			addButton();
			 		}else{
			 			buildPn(videoSrcData, videoArrays);
			 		}
			 	}else{
			 		console.log('There was a problem loading video files. Please Try again later'); //USER ERROR
			 	}
			})

	}else{
		console.log('Unsupported MIME type or codec: ', mimeCodec); //USER ERROR
	}


	manageLang();

	function addButton(){
		const btn = document.getElementsByClassName('intro-description-start-btn')[0];
		const intro = document.getElementsByClassName('intro')[0];

		btn.addEventListener(
			'click',
			function(e){
				buildPn(videoSrcData, videoArrays);
				intro.classList.add('fade-out');
				intro.classList.add('intro-off');
			}
		)

		//enable play button when all videos are loaded
		btn.classList.add('intro-description-start-btn-on');
		btn.classList.add('fade-in');

		btn.addEventListener('transitionend', () =>	btn.classList.remove('fade-in'));
		intro.addEventListener('transitionend', () =>	intro.classList.remove('fade-out'));
	}

}

document.addEventListener('DOMContentLoaded', init);


//=======================================================//
//   CREATE MEDIA SOURCE, SEQUENCE and FEED PLAYERS    	 //
//=======================================================//
function buildPn(videoSrcData, videoArrays){

	/* Create video elements */		
	const [video, mediaSource] = createMediaSource();

	/* Start sourceBuffer  */	
	feedPlayer(videoArrays, videoSrcData, video, mediaSource);
}


//============================//
//	  PLAYERS FIRST FEEDING	  //
//============================//
function feedPlayer(videoArrays, videoSrcData, video, mediaSource, visibleTopLimit = 7){

	const containerPn = document.getElementsByClassName('pn')[0];
	const references = document.getElementsByClassName('info-display-references')[0];

	//when mediaSource is ready to recieve files/video segments
	mediaSource.addEventListener('sourceopen', function(){

		//Add files/video segments codec and allow playback order indep. of file's timestamp
	  const sourceBuffer = mediaSource.addSourceBuffer(videoSrcData.mimeCodec);
	  sourceBuffer.mode = 'sequence';

	  //Check total files size and alert developers
	  let totalMBytes = 0;

	  for(let i = 0; i < videoArrays.length; i++){
	  	totalMBytes += videoArrays[i].files.reduce( (running, video) => running + video.buffer.byteLength, 0);
	  }
		  
		totalMBytes = Number((totalMBytes / (1024 * 1024)).toFixed(2)); //size in MB

		if(totalMBytes * 2 > videoSrcData.bufferQuota.size){
			console.error(`Files total size (${totalMBytes} MB) will exceed the buffer size "Pn=n!" needs to work properly (${Math.round(totalMBytes * 2)} MB). ${videoSrcData.bufferQuota.browser}'s buffer quota is ${videoSrcData.bufferQuota.size}MB. Reduce file sizes or append files in smaller batches (and change the appendBuffer logic!!!)`);
		}else{
			//simulate Flash buffer empty before loading new squence
			const updateDisplay = updateDisplayInfo();
			updateDisplay.buffer('empty');
			
			const track = video.addTextTrack("metadata");
			nextSequence(videoSrcData, videoArrays, video, sourceBuffer, null, track);					
			cueListener(track, video, sourceBuffer, sequenceData);
    }

 	 	const sequenceLimitCSS = Number(window.getComputedStyle(document.querySelector('body'),'::before').getPropertyValue('content').replace(/\"/g, ''));
		sequenceData.visible = (sequenceLimitCSS > 0 && sequenceLimitCSS < visibleTopLimit) ? sequenceLimitCSS : visibleTopLimit;

	  containerPn.insertBefore(video, references);

	});

}


//============================================//
// 	 CREATE SEQUENCE & START BUFFER UPDATE    //
//============================================//
function nextSequence(videoSrcData, videoArrays, video, sourceBuffer, offset, track){

	//create new sequence
	sequenceData.sequence = createSequence(videoSrcData, videoArrays);

	//append from the beginning of sourceBuffer
	if(offset === 0){
		sourceBuffer.timestampOffset = offset;
	}

	//get arrayBuffers using the references created in the sequence array
	const role = sequenceData.sequence[0].role;
	const position = sequenceData.sequence[0].position;

	//Append the first file in sequence manually to trigger updateEnd event 
	sourceBuffer.appendBuffer(videoArrays[role].files[position].buffer);
  sourceBuffer.onupdateend = appendSequenceFiles(video, sourceBuffer, sequenceData, track);

}


//===========================================//
//  	ADD REMAINING FILES IN THE SEQUENCE    //
//===========================================//
function appendSequenceFiles(video, sourceBuffer, sequenceData, track){
	
	let i = 1;
	const updateDisplay = updateDisplayInfo();

	return function(){	

		if(i < sequenceData.sequence.length){
			const role = sequenceData.sequence[i].role;
			const position = sequenceData.sequence[i].position;

	   	sourceBuffer.appendBuffer(videoArrays[role].files[position].buffer);
	    i++;
	  }else{
			//Only once to get single sequence (instead of whole sourceBuffer) duration 
	    if(sequenceData.duration === 0){
	    	sequenceData.duration = sourceBuffer.buffered.end(0);
	    	addToTrack(track, 0, sequenceData);
	    }else{
	    	//Append next sequence at the beginning or after the first 
	    	const offset = (video.currentTime > sequenceData.duration) ? 0 : sequenceData.duration;
	    	addToTrack(track, offset, sequenceData);
	    }

	    video.play();
	  }
	
	}
}


//==========================================================================//
//	 METADATA CUES CHANGE LISTENER   								   					    		  	//
//   CONTROLS DOM TEXT UPDATES, NEW SEQUENCES CREATION AND MSE VIDEO LOOP   //
//==========================================================================//
function cueListener(track, video, sourceBuffer, sequenceData){

	let lastFile = '';
	const updateDisplay = updateDisplayInfo();

	return (function(){

		//prepare listener to detect cue points changes
	  track.addEventListener("cuechange", (event) => {
		  if(event.target.activeCues[0]){

		  	const cue = event.target.activeCues[0];
		  	const data = cue.text.split(",");
			  	
		  	//Update DOM information or activate endFlag
		  	if(data[0] === "end"){
		  		video.currentTime = 0;
		  	//prevent multiple cuechange positives while cue is active 
		  	}else if(lastFile !== data[0]){

					//The sequence() method will check how the DOM gets updated			
					if(sequenceData.remaining === 1 || sequenceData.remaining === 0){
						updateDisplay.sequence(sequenceData);
					}else if(sequenceData.total === 0){ //for the first run
						updateDisplay.sequence(sequenceData);
					}

		  		if(sequenceData.remaining === 0){
			  		sequenceData.total++;
			  		sequenceData.remaining = sequenceData.sequence.length - 1;
			  	}else{
			  		sequenceData.remaining--;	
			  	}

		  		requestAnimationFrame(function(){
						updateDisplay.shot(sequenceData, data[1], data[0], videoSrcData.fantasyPath);
						lastFile = data[0];
						updateDisplay.buffer('flush', data[1]);
						//console.log(cue);
			  	})
		  	}

		  	//Load next sequence when segment/cue loaded is near the 40% or 80% of the sourceBuffer
		  	if(cue === track.cues[Math.floor(sequenceData.sequence.length * 0.8)] && video.currentTime < sequenceData.duration){		
		  		//uses filesArray.length as the first run has only one sequence
					
					//simulate Flash buffer empty before loading new squence
					updateDisplay.buffer('empty');
					
					nextSequence(videoSrcData, videoArrays, video, sourceBuffer, sequenceData.duration, track);
		  	}else if(cue === track.cues[Math.floor((track.cues.length - 1) * 0.8)] && video.currentTime > sequenceData.duration){		  		
		  		//when we are on the 2nd sequence in the stream, append from 0 		
					
					//simulate Flash buffer empty before loading new squence
					updateDisplay.buffer('empty');
					
					nextSequence(videoSrcData, videoArrays, video, sourceBuffer, 0, track);
		  	}

		 	}
		});
	})();

}


//==================================================//
//	 ADD TIME METADATA CUES FOR EVERY NEW SEQUENCE  //
//==================================================//
function addToTrack(track, offset, sequenceData){

	//clean previous cues to prevent "multiplication"
	if(offset === 0 && track.cues.length !== 0){ //ignore the first run
		//delete cues for (old) 1st sequence
		Array.from(track.cues).map( cue => {
			if(cue.endTime < sequenceData.duration){
				track.removeCue(cue)
			}
		})
	}else if(track.cues.length !== 0 && track.cues.length > sequenceData.sequence.length){ //ignore the first run	
		//delete cues for (old) 2nd sequence
		Array.from(track.cues).map( cue => {
			if(cue.endTime > sequenceData.duration){
				track.removeCue(cue)
			}
		})
	}


	let last = (offset === 0) ? 0.020 : decimals(offset, 3);

	for(let i = 0; i < sequenceData.sequence.length; i++){

		const startTime = (i === 0) ? decimals(last, 3) : decimals(last + sequenceData.cueDelay, 3); //anticipate to onccuechange Chrome delays
		let endTime = (i === 0 && offset === 0) ? decimals(sequenceData.sequence[i].duration + sequenceData.cueDelay, 3) : decimals(last + sequenceData.sequence[i].duration + sequenceData.cueDelay, 3);

		//additional cue signaling end of stream
		if(i === sequenceData.sequence.length - 1 && offset !== 0){
			//special duration for "one before last" segment cue to avoid colisions with endCue
			endTime -= 0.200; 

			const endCue = offset * 2;
			const cue = new VTTCue(endCue - 0.170, endCue, 'end');
			track.addCue(cue);
		}
		
		track.addCue(new VTTCue(startTime, endTime, `${sequenceData.sequence[i].fname},${Math.floor(sequenceData.sequence[i].duration * 1000)}`));
		
		if(i === 0){
			last = offset + sequenceData.sequence[i].duration;
		}else{
			last += sequenceData.sequence[i].duration;	
		}
	}
}


//==============================//
//	 UPDATE TEXT DISPLAY DATA   //
//==============================//
function updateDisplayInfo(){

	const containerPn = document.getElementsByClassName('pn')[0];
	let containerPlaylist = document.getElementsByClassName('info-display-playlists')[0];
	const references = document.getElementsByClassName('info-display-references')[0];
	const status = document.getElementsByClassName('info-display-buffer')[0];
	let refreshListing = false;

	return{

		/* UPDATE DATA FOR CURRENT VIDEO */
		shot(sequenceData, duration, shot, fantasyPath){
			const plural = (sequenceData.remaining !== 1) ? 's' : '';
			const values = [sequenceData.total, sequenceData.remaining, plural, duration, fantasyPath + '/' + shot];
	  	let iterartor = 0;
	  	const walker = document.createTreeWalker(
	      references,
	      NodeFilter.SHOW_ELEMENT,
	      null,
	      false
	  	);

	  	while (walker.nextNode()) {
	      if(walker.currentNode.className === 'shot-update'){
	      	walker.currentNode.textContent = values[iterartor];	
	      	iterartor++;
	      }
	  	}
			
	  	let playingPlaylist;

	  	if(sequenceData.remaining === 0 && sequenceData.total % sequenceData.visible !== 0){ 
	  		//last video in sequence, the next playlist was reciently printed in the DOM
				playingPlaylist = containerPlaylist.children[containerPlaylist.children.length - 2];
			}else{
				playingPlaylist = containerPlaylist.children[containerPlaylist.children.length - 1];
			}

			const walkerPlaylists = document.createTreeWalker(
	      playingPlaylist,
	      NodeFilter.SHOW_ELEMENT,
	      null,
	      false
	  	);

	  	while (walkerPlaylists.nextNode()) {
	      if(walkerPlaylists.currentNode.textContent === shot){
					walkerPlaylists.currentNode.classList.add('playlist-current');
	      }else{
	      	walkerPlaylists.currentNode.classList.remove('playlist-current');
	      }
	  	}

			//remove highlight from file name in the last sequence
			if(containerPlaylist.children.length > 1 && sequenceData.remaining === sequenceData.sequence.length - 1){
				const lastEl = containerPlaylist.lastElementChild.children.length - 1;
				containerPlaylist.children[containerPlaylist.children.length - 2].children[lastEl].classList.remove('playlist-current');
			}

		},
		
		/* UPDATE SEQUENCES LISTS */
		sequence(sequenceData){

			const fragment = document.createDocumentFragment();
			const ul = document.createElement('ol')
			ul.className = 'playlist';

			for(let i = 0; i < sequenceData.sequence.length; i++){
				const li = document.createElement('li');
				li.textContent = sequenceData.sequence[i].fname;
				ul.appendChild(li);
			}

			if(refreshListing === true && sequenceData.remaining === 0){
				const fragment = document.createDocumentFragment();
				const newContainer = document.createElement('div');
				newContainer.className = containerPlaylist.className;
				newContainer.appendChild(ul);
				containerPn.replaceChild(newContainer, containerPlaylist);
				containerPlaylist = newContainer;
				refreshListing = false;
			}else if((sequenceData.remaining === 1 && sequenceData.total % sequenceData.visible !== 0) || sequenceData.total === 0){ //sequenceData.total for first run
				containerPlaylist.appendChild(ul);
			}

			if(sequenceData.total % sequenceData.visible === 0 && sequenceData.remaining === 1 && sequenceData.total !== 0){
				//second AND prevents double run, last AND prevents first run
				refreshListing = true;
			}

		},

		/* UPDATE BUFFER STATUS */
		buffer(key, duration){
			const msg = {
				empty : 'NetStream.Buffer.Empty',
				full : 'NetStream.Buffer.Full',
				flush : 'NetStream.Buffer.Flush',
				start : 'NetStream.Play.Start',
				stop : 'NetStream.Play.Stop'
			}

			const end = ['empty','stop','stop','stop','stop','stop','stop','flush','flush'];

			switch(key){
				case 'flush':

					status.textContent = msg['start']; 

					if(duration < 2100){ //file duration after while Flash seemed to fill the buffer
						setTimeout( () =>	status.textContent = msg[key] , 84); //keep "start" 2 frames
					}else{
						setTimeout( () =>	status.textContent = msg['full'], 84);
						
						//weird formula used to aproximate Flash observed behaviour
						const bufferFull = Math.floor(((duration - 2100) / 80) * 42); 
						setTimeout( () =>	status.textContent = msg[key], bufferFull);
					}

					//random stop/buffer empty at the end of longer files
					const rand = Math.floor(Math.random() * end.length);
					setTimeout( () =>	status.textContent = msg[end[rand]], duration - 142);

				break;
				default:
					status.textContent = msg[key];
				break;
			}
		}
		
	}	
}


//===============================================//
//	 SHUFFLE AND MIX VIDEOS FOR EACH CATEGORY	   //
//===============================================//
function createSequence(videoSrcData, videoArrays){

	//shuffle arrays for each role
	const rolesArrays = videoArrays.map( (array, i) => {
		return FYshuffle(array.files, i);
	});

	//create a new array with shuffled arrays for each role
	const sequenceMix = [];
	for(let i = 0; i < videoSrcData.total; i++){
		sequenceMix.push(rolesArrays[0][i], rolesArrays[1][i], rolesArrays[2][i]);
	}
	
	return sequenceMix;
}


//===========================================//
//	 FISHER-YATES SHUFFLE MODERN ALGORITHM   //
//===========================================//
function FYshuffle(array, role){
	let size = array.length;
	let rand, temp; //random number and temporary swapping value holders
	const pointerArray = []; //new array to store name, role and position in original array

	/* build an array of objects with references to the original
   array so we don't duplicate files arrayBuffers/blobs */
	for(let i = 0; i < array.length; i++){
		const e = (i < 10) ? '0' + i : i;
		pointerArray.push({					
			fname : array[i].name,
			duration : array[i].duration,
			role :  role,
			position : i			 
		});
	}
	
	//no shuffle when size = 0 as there's only one value left and no chance to swap
	while(--size){
		rand = Math.floor(Math.random() * size);
		temp = pointerArray[rand]; 
		pointerArray[rand] = pointerArray[size];
		pointerArray[size] = temp;
	}

	return pointerArray;
}


//=====================//
//		INTRO LOADER 		 //
//=====================//
function updateIntroLoader(item, arrayNum, videoArrays){

	const videoElement = item.getElementsByTagName('video')[0];

	const fileName = item.getElementsByTagName('img')[0].getAttribute('src').split("/")[2].split(".")[0] + ".mp4";
  const videoSrc = videoArrays[arrayNum].files.find( video => video.name === fileName );

	const blob = new Blob([videoSrc.buffer], { type: "video/mp4" });
	videoElement.src = window.URL.createObjectURL(blob);
	videoElement.mute = "mute";
	videoElement.loop = "loop";
	videoElement.play();
	videoElement.addEventListener("playing", removeLoading);

	function removeLoading(){
		item.classList.add('intro-description-loading-list-item_loaded');
		videoElement.removeEventListener("playing", removeLoading);
	}

}

//=========================//
//		LOAD VIDEO FILES		 //
//=========================//
function loadVideoFiles(videoSrcData, videoArrays, loadingElements){

	let allDurationsCheck = 0;

	return new Promise((resolve, reject) => {
			// IIFE that calls itself when previous promise resolves
		(function promiseLoop(i) { 

			if (i < videoArrays.length) {
				const videoURLs = [];
				const path = videoSrcData.path + '/' + videoArrays[i].dir + '/';
				const name = videoArrays[i].fname;
				for(let e = 0; e < videoSrcData.total; e++){
					const nmbr = (e < 10) ? '0' + e : e;
					videoURLs.push({
						name : name + nmbr + '.' + videoSrcData.format,
						url : path + name + nmbr + '.' + videoSrcData.format
					});
				} 

	
				Promise
					.all( videoURLs.map( video => fetch(video.url) ) )
		 			.then( responses => {
						return Promise.all( responses.map( data => data.arrayBuffer()	))
		 			})
					.then( data => {
						data.map( (arrayBuff, index) => {

							let tempVideo = document.createElement('video');
							let blob = new Blob([arrayBuff], { type: "video/mp4" });
							tempVideo.src = URL.createObjectURL(blob);

							tempVideo.addEventListener('loadedmetadata', function() {
 								videoArrays[i].files[index].duration = tempVideo.duration;
 								blob = null;
 								allDurationsCheck++;

 								if(allDurationsCheck === videoArrays.length * videoSrcData.total){
 									resolve("ready");
 								}
 	
							});

							const file = {
								name : videoURLs[index].name, 
								duration : 0,
								buffer: arrayBuff
							};

							videoArrays[i].files.push(file);					
						});
						updateIntroLoader(loadingElements[i], i, videoArrays);
						promiseLoop(i+1);
					})
					.catch( error => console.log(error) )
			
			}
		})(0);

	})

}

//=============================//
//		CREATE VIDEO ELEMENTS		 //
//=============================//
function createMediaSource(){

	const video = document.createElement('video');

	const mediaSource = new MediaSource();
	video.src = window.URL.createObjectURL(mediaSource);
	video.muted = 'muted'; //prevent "forbid autoplay with sound" policy
	video.addEventListener('contextmenu', (e) => { //prevent right click video manipulation
	   e.preventDefault(); 
	   return false; 
	});
	
	return [video, mediaSource];

}


//=====================//
//		TRIM DECIMALS		 //
//=====================//
function decimals(number, decPoints){
	const positions = Math.pow(10, decPoints);
	return Math.round(number * positions) / positions;
}


/*_______________________________________________________________________*/
//                                    																	 //
//                  EN/ES LANGUAGES SPECIFIC FUNCTIONS                   //
/*_______________________________________________________________________*/

//======================================//
//		Do checks for language changes    //
//======================================//
function manageLang(){

	//change default language if "es" in URL
	const langBtns = document.querySelectorAll('.intro-langmenu a');

	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	const lang = urlParams.get('lang');
	changeLang(lang || undefined);

	if(lang){
		for(let e = 0; e < langBtns.length; e++){
			langBtns[e].setAttribute('aria-current', '');
		}
		document.querySelector('.intro-langmenu a[lang="' + lang + '"]').setAttribute('aria-current', 'true');
	}

	//add events to language buttons in about page
	for( let i = 0; i < langBtns.length; i++){
		langBtns[i].addEventListener('click', function(e){
			e.preventDefault();
			for(let e = 0; e < langBtns.length; e++){
				langBtns[e].setAttribute('aria-current', '');
			}
			e.currentTarget.setAttribute('aria-current', 'true');
			const lang = langBtns[i].getAttribute('lang');
			changeLang(lang);	
		});
	}

}


//==================================================================//
//		Change page title, html.lang and texts to a given language    //
//==================================================================//
function changeLang(lang = 'en'){

	const translations = {
		'en' : {
			htmlTitle : 'A Javascript restoration of «Pn=n!» (2006) by Iván Marino :: Marcelo Terreni',
			title: 'A Javascript restoration of <cite class="pn-title">P<sub>n</sub>=n!</cite>&nbsp;(2006) by <span lang="es">Iván Marino</span> built with ES6, MSE, CSS & HandbrakeCLI',
			description: '<p>First exhibited in March 2006, <cite class="pn-title">P<sub>n</sub>=n!</cite> was a media art installation developed in Flash by the argentinian artist <span lang="es">Iván Marino</span>. A sequence from the film <cite lang="fr">“La Passion de Jeanne d\'Arc”</cite> (1928) by Carl T. Dreyer was divided into its constituent shots and repurposed to address the idea of torture as an algorithm, a piece of software. For every new sequence in the project, an individual shot from the film was randomly selected and reedited into a new progression that would fatally mirror the three semantic cornerstones present in several torture procedures: victims, victimizers and torture instruments.</p>\n<p>For this conservation project I rewrote the code from scratch with ES6, used the MediaSource Element to manage video playback and built a responsive CSS layout to meet the requirements of the modern web. Although the source video was reprocessed with HandbrakeCLI from a more recent transfer of the film, I took care to mimic the look and feel of the original *.flv files in After Effects. A detailed tutorial of this new media restoration work is coming up soon. Meanwhile, <a href="http://terreni.com.ar">check any of the other works in my personal portfolio</a>.</p>',
			viewwork : 'View <cite class="pn-title">P<sub>n</sub>=n!</cite> restoration',
			loadings : ['Loading Judges', 'Loading Jeanne', 'Loading Machines'],
			credits : 'Restored with ES6, CSS & HandbrakeCLI by <a href="http://terreni.com.ar">Marcelo Terreni</a>',
			viewsource : 'View source in <strong>GitHub</strong>'
		},
		'es' : {
			htmlTitle : 'Una versión en Javascript de «Pn=n!» (2006) de Iván Marino :: Marcelo Terreni',
			title: 'Un ejercicio de preservación sobre la obra Pn=n!&nbsp;(2006) de Iván Marino desarrollado con ES6, MSE, CSS & HandbrakeCLI',
			description: '<p>Exhibida por primera vez en marzo de 2006, <cite class="pn-title">P<sub>n</sub>=n!</cite> es una instalación programada en Flash por el artista argentino Iván Marino. El autor dividió una secuencia del film <cite lang="fr">“La Passion de Jeanne d\'Arc”</span> (1928) de Carl T. Dreyer en sus planos constituitivos para luego resignificarlos en una meditación sobre la tortura como algoritmo, como un proceso suceptible de ser transformado en software. En cada nueva secuencia del proyecto, una toma individual del film era seleccionada y remontada en una nueva progresión de planos que sigue el orden de los tres pilares semánticos presentes en varios procedimientos de tortura: víctimas, victimarios e instrumentos de tortura.</p>\n<p>Para este proyecto de restauración reescribí el código con ES6, use el elemento <span lang="en">MediaSource</span> para manejar la reproducción de video y construí vía CSS un diseño mejor adaptado a los requerimientos de la web moderna. Aunque el material fue recomprimido con HandbrakeCLI a partir de un transfer más reciente del film, me tomé el trabajo de imitar el aspecto de los archivos *.flv originales en After Effects para conseguir una reproducción lo más fiel posible. Prontó escribiré un tutorial detallado sobre las soluciones que encontré durante el trabajo de restauración. Mientras tanto, <a href="http://terreni.com.ar">te invito a navegar alguno de los otros trabajos exhibidos en mi portfolio personal</a>.</p>',
			viewwork : 'Ver <cite class="pn-title">P<sub>n</sub>=n!</cite> restaurada',
			loadings : ['Cargando Jueces', 'Cargando Juana', 'Cargando Instrumentos'],
			credits : 'Obra restaurada con ES6, CSS & HandbrakeCLI por <a href="http://terreni.com.ar">Marcelo Terreni</a>',
			viewsource : 'Ver el código en <strong>GitHub</strong>'
		}
	};

	document.getElementsByTagName('html')[0].setAttribute('lang', lang);
	document.title = translations[lang].htmlTitle;

	const pnIntroTitle = document.getElementsByClassName('intro-description-title')[0];
	const pnIntroDescription = document.getElementsByClassName('intro-description-bio')[0];
	const pnIntroCredits = document.getElementsByClassName('intro-description-credits')[0];
	const pnIntroViewwork = document.querySelector('.intro-description-start-btn span');
	const pnIntroLoadings = document.querySelectorAll('.intro-description-loading-list p');
	const pnIntroViewsource = document.getElementsByClassName('intro-description-viewsource')[0];

	/* Text translation */
	pnIntroTitle.innerHTML = translations[lang].title;
	pnIntroDescription.innerHTML = translations[lang].description;
	pnIntroCredits.innerHTML = translations[lang].credits;
	pnIntroViewwork.innerHTML = translations[lang].viewwork;
	pnIntroViewsource.innerHTML = translations[lang].viewsource;

	for(let i = 0; i < pnIntroLoadings.length; i++){
		pnIntroLoadings[i].textContent = translations[lang].loadings[i];
	}

}