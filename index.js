var jsmediatags = require("jsmediatags");
var fs = require("fs");
const express = require("express");

var Airtable = require('airtable');
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_API_KEY
});
var base = Airtable.base('app6GHxtqv6bp7oBk');

var bodyParser = require('body-parser');
var axios = require('axios');
var cors = require('cors');
const path = require('path');
var qs = require('qs');
const app = express();
let port = process.env.PORT || 3000;
const btoa = function (str) { return Buffer.from(str, 'binary').toString('base64'); };

app.get('/page', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.use(cors({ origin: 'http://localhost:3000/*' }));
app.use(cors({ origin: 'https://iogoulias.github.io' }));
app.use(cors({ origin: '*' }));
app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/image', function (req, res) {
    console.log("requested");
    res.sendFile(path.join(__dirname, '/' + req.query.file));
});

app.get("/artwork", function (req, res) {
    var id = req.query.id;
    var file = req.query.file;
    var source = req.query.source;  // New argument "source"
    var readUrl;
    var sourceInTracksTable;

    // Set the correct URL based on the "source" argument
    if (source === "new") {
        readUrl = "https://docs.google.com/uc?export=download&id=" + id;
        sourceInTracksTable = "new";
    } else if (source.includes("dnbportal")) {
        readUrl =
            "https://www.googleapis.com/drive/v3/files/" +
            id +
            "?alt=media&key=" +
            process.env.GOOGLE_DRIVE_API_KEY;
        sourceInTracksTable = "dnbportal";
    } else {
        res.send(JSON.stringify({ "result": "Unknown sync source in Google Drive table (needs to be New or DNBPortal …)"}));
        return;
    }
    
    // Use jsmediatags with the dynamically set URL
    jsmediatags.read(readUrl, {
        onSuccess: async function (tag) {
            var image = null;
            // Tags
            if ((tag.tags).hasOwnProperty("picture")) {
                console.log('has picture');
                image = tag.tags.picture;
            }
            // Artist
            var artist = null;
            if ((tag.tags).hasOwnProperty("artist")) {
                console.log('has artist');
                artist = tag.tags.artist;
            }
            // Album
            var album = null;
            if ((tag.tags).hasOwnProperty("album")) {
                console.log('has album');
                album = tag.tags.album;
            }
            // Title
            var title = null;
            if ((tag.tags).hasOwnProperty("title")) {
                console.log('has title');
                title = tag.tags.title;
            }
            // Track number (often "3" or "3/12")
            var trackRaw = null;
            if ((tag.tags).hasOwnProperty("track")) trackRaw = tag.tags.track;

            // Prepare Airtable fields
            let airtableFields = {
                "File ID (Google Drive)": id,
                "File Name (Google Drive)": file,
                "Artists (Metadata)": artist,
                "Album (Metadata)": album,
                "Track Name (Metadata)": title,
                "Track Number (Metadata)": trackNumber, // number field
                "Track Number String (Metadata)": trackRaw, // text field (keeps "3/12")
                "Source": sourceInTracksTable
            };

            // Image
            if (image != null) {
                console.log('has image');
                var writeformat = ((image.format).split("/"))[1];
                if (writeformat == "jpeg") {
                    writeformat = "jpg";
                }
                fs.writeFile(id + "." + writeformat, Buffer.from(image.data), "binary", async function (err) {
                    var temppath = path.dirname(require.main.filename);
                    if (err) {
                        console.log('Error writing file:', err);
                        res.send(JSON.stringify({ "result": "file write error" }));
                        return;
                    }
                    console.log('File written successfully');

                    console.log(temppath + "\\" + id + "." + writeformat);
                    // Add Album Artwork URL if the image exists
                    airtableFields["Album Artwork"] = [{ "url": "https://airwaves-rw4kx.ondigitalocean.app/image?file=" + id + "." + writeformat }];
                    
                    var tempresp = await airtable(airtableFields, id);
                    console.log(tempresp);
                    res.send(JSON.stringify(tempresp));
                });
            } else {
                // No image, so no Album Artwork
                airtableFields["Album Artwork"] = null;

                var tempresp = await airtable(airtableFields, id);
                res.send(JSON.stringify(tempresp));
            }
        },
        onError: function (error) {
            console.log("error from " + readUrl, error.type, error.info);
            res.send(JSON.stringify({ "result": "unexpected error" }));
        }
    });
});

app.listen(port, () => {
    console.log('Example app is listening on port http://localhost:' + port);
});

async function airtable(fields, id) {
    console.log("called airtable");
    return new Promise((resolve, reject) => {
        base('Tracks').create([{ "fields": fields }], function (err, records) {
            try {
                if (err) {
                    console.log('Error with Airtable API:', err);
                    resolve({ "result": "not ok" });
                } else {
                    console.log('Record created successfully:', JSON.stringify(records, null, 2));
                    resolve({ "result": "ok" });
                }
            } catch (error) {
                console.error('Error in Airtable callback:', error);
                resolve({ "result": "callback error" });
            }
        });
    });
}
