var Module = {
    arguments: ["/game.love"],
    printErr: console.error.bind(console),
    canvas: (function() {
        var canvas = document.getElementById('canvas');

        canvas.addEventListener("webglcontextlost", function(e) {
            e.preventDefault();
            console.log('webglcontextlost');
            location.reload();
        }, false);

        return canvas;
    })(),
    setFocus: setFocus,
    setStatus: function(text, soFar, total) {
        if (text) {
            drawLoadingStatus(text, soFar, total);
        } else if (Module.remainingDependencies === 0) {
            document.getElementById('message-container').style.display = 'none';
        }
    },
    onRuntimeInitialized: function() {
        window.addEventListener('focus', function() {
            if (typeof Module['_love_setFocus'] === 'function') {
                Module._love_setFocus(true);
            }
        });
        window.addEventListener('blur', function() {
            if (typeof Module['_love_setFocus'] === 'function') {
                Module._love_setFocus(false);
            }
        });
    },
    setExceptionMessage: onException,
    totalDependencies: 0,
    remainingDependencies: 0,
    monitorRunDependencies: function(left) {
        this.remainingDependencies = left;
        this.totalDependencies = Math.max(this.totalDependencies, left);
        Module.setStatus(
            left
                ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')'
                : 'All downloads complete.'
        );
    }
};

Module.setStatus('Downloading...');

var applicationLoad = function(e) {
    Love(Module);
};

if (typeof Module === 'undefined')
    Module = eval('(function() { try { return Module || {} } catch(e) { return {} } })()');

if (!Module.expectedDataFileDownloads) {
    Module.expectedDataFileDownloads = 0;
    Module.finishedDataFileDownloads = 0;
}

Module.expectedDataFileDownloads++;

(function() {

    var loadPackage = function(metadata) {

        var PACKAGE_PATH;
        if (typeof window === 'object') {
            PACKAGE_PATH = window['encodeURIComponent'](
                window.location.pathname.toString().substring(
                    0,
                    window.location.pathname.toString().lastIndexOf('/')
                ) + '/'
            );
        } else if (typeof location !== 'undefined') {
            PACKAGE_PATH = encodeURIComponent(
                location.pathname.toString().substring(
                    0,
                    location.pathname.toString().lastIndexOf('/')
                ) + '/'
            );
        } else {
            throw 'using preloaded data can only be done on a web page or in a web worker';
        }

        var PACKAGE_NAME = 'game.data';
        var REMOTE_PACKAGE_BASE = 'game.data';

        if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
            Module['locateFile'] = Module['locateFilePackage'];
        }

        var REMOTE_PACKAGE_NAME = typeof Module['locateFile'] === 'function'
            ? Module['locateFile'](REMOTE_PACKAGE_BASE)
            : ((Module['filePackagePrefixURL'] || '') + REMOTE_PACKAGE_BASE);

        var PACKAGE_UUID = metadata.package_uuid;

        function fetchAndCombineParts(baseName, callback, errback) {

            var parts = [
               "https://cdn.jsdelivr.net/gh/imarcussun2-afk/balatro-web@main/" + baseName + ".part1",
               "https://cdn.jsdelivr.net/gh/imarcussun2-afk/balatro-web@main/" + baseName + ".part2",
               "https://cdn.jsdelivr.net/gh/imarcussun2-afk/balatro-web@main/" + baseName + ".part3"
            ];

            var loadedParts = [];
            var loadedCount = 0;

            function fetchPart(index) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', parts[index], true);
                xhr.responseType = 'arraybuffer';

                xhr.onerror = function() {
                    errback(new Error("Failed to load " + parts[index]));
                };

                xhr.onload = function() {
                    if (xhr.status == 200 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) {
                        loadedParts[index] = xhr.response;
                        loadedCount++;

                        if (loadedCount === parts.length) {
                            var totalLength = 0;
                            for (var i = 0; i < loadedParts.length; i++) {
                                totalLength += loadedParts[i].byteLength;
                            }

                            var combined = new Uint8Array(totalLength);
                            var offset = 0;

                            for (var i = 0; i < loadedParts.length; i++) {
                                combined.set(new Uint8Array(loadedParts[i]), offset);
                                offset += loadedParts[i].byteLength;
                            }

                            callback(combined.buffer);
                        }
                    } else {
                        errback(new Error("HTTP " + xhr.status + " for " + parts[index]));
                    }
                };

                xhr.send(null);
            }

            for (var i = 0; i < parts.length; i++) {
                fetchPart(i);
            }
        }

        function runWithFS() {

            function assert(check, msg) {
                if (!check) throw msg + new Error().stack;
            }

            function DataRequest(start, end) {
                this.start = start;
                this.end = end;
            }

            DataRequest.prototype = {
                requests: {},
                open: function(mode, name) {
                    this.name = name;
                    this.requests[name] = this;
                    Module['addRunDependency']('fp ' + this.name);
                },
                send: function() {},
                onload: function() {
                    var byteArray = this.byteArray.subarray(this.start, this.end);
                    this.finish(byteArray);
                },
                finish: function(byteArray) {
                    Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
                    Module['removeRunDependency']('fp ' + this.name);
                    this.requests[this.name] = null;
                }
            };

            var files = metadata.files;
            for (i = 0; i < files.length; ++i) {
                new DataRequest(files[i].start, files[i].end).open('GET', files[i].filename);
            }

            function processPackageData(arrayBuffer) {

                Module.finishedDataFileDownloads++;
                assert(arrayBuffer instanceof ArrayBuffer, 'bad input');

                var byteArray = new Uint8Array(arrayBuffer);

                var ptr = Module._malloc(byteArray.length);
                Module['HEAPU8'].set(byteArray, ptr);

                DataRequest.prototype.byteArray =
                    Module['HEAPU8'].subarray(ptr, ptr + byteArray.length);

                for (i = 0; i < files.length; ++i) {
                    DataRequest.prototype.requests[files[i].filename].onload();
                }

                Module['removeRunDependency']('datafile_game.data');
            }

            Module['addRunDependency']('datafile_game.data');

            fetchAndCombineParts(
                REMOTE_PACKAGE_NAME,
                processPackageData,
                function(error) {
                    console.error(error);
                }
            );

            if (Module['setStatus'])
                Module['setStatus']('Downloading...');
        }

        if (Module['calledRun']) {
            runWithFS();
        } else {
            if (!Module['preRun']) Module['preRun'] = [];
            Module["preRun"].push(runWithFS);
        }
    };

    loadPackage({
        "files": [
            { "filename": "/game.love", "start": 0, "end": 56672712 }
        ],
        "remote_package_size": 56672712,
        "package_uuid": "5257bc69-3010-4f90-9b81-76d0075e3de4"
    });

})();
