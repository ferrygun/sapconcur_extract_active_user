const request = require('request');
const async = require('async');
const moment = require('moment');
const util = require('util')
const fs = require('fs');

var ConcurUserList = [];
var ConcurUserListDetails = [];
var ConcurUserRoleDetails = [];
const maxAsync = 1;
const slackItemsPerPage = 100;
let access_token;

const concururl = 'https://us2.api.concursolutions.com';
const CLIENT_ID = '';
const CLIENT_SECRET = '';
const REFRESH_TOKEN = '';

function getToken(callback) {
    var  form = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': REFRESH_TOKEN,
        'grant_type': 'refresh_token'
    };

    var options = {
        method: 'POST',
        url: concururl + '/oauth2/v0/token',
        form: form
    };
    request(options, 
        function(error, response, body){
            if(error) {
                callback(error);
            } else if(response.statusCode != 200) { 
                callback();
            } else {
                body = JSON.parse(body);
                access_token = body.access_token
                console.log(access_token)
                callback();
            } 
        }
    );
}

function getActiveConcurUsers(startIndex, callback) {
    var options = {
        method: 'GET',
        url: concururl + '/users/?offset=' + startIndex + '&limit=100&isactive=true',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        }
    };
    if(startIndex % 500 === 0) {
        getToken(function (err) {});
    }
    request(options, 
        function(error, response, body){
            if(error) {
                if(error.code == 'ECONNRESET') {
                    callback(error);
                }
            } else if(response.statusCode != 200) { 
                callback('HTTP: ' + response.statusCode + 'username: ' + concurUser);
            } else {
                body = JSON.parse(body);
                if(body.Items.length > 0) {
                   for (let z=0; z<body.Items.length; z++) {
                        ConcurUserListDetails.push({
                            "LoginID": body.Items[z].LoginID,
                            "ID": body.Items[z].ID,
                            "CountryCode": body.Items[z].CountryCode,
                            "PrimaryEmail": body.Items[z].PrimaryEmail
                        })
                   }
                } else {
                    console.log("id doesn't exist:" + concurUser)
                }
                callback();
                
            } 
        }
    );
}

function getConcurUsers(concurUser, callback) {
    var options = {
        method: 'GET',
        url: concururl + '/identity/v4/Users?filter=userName eq "' + concurUser + '"',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        }
    };
    request(options, 
        function(error, response, body){
            if(error) {
                if(error.code == 'ECONNRESET'){
                    callback(error);
                }
            } else if(response.statusCode != 200) { 
                callback('HTTP: ' + response.statusCode + 'username: ' + concurUser);
            } else {
                body = JSON.parse(body);
                if(body.Resources.length > 0) {
                    ConcurUserListDetails.push({
                        "name": concurUser,
                        "id": body.Resources[0].id
                    })
                } else {
                    console.log("id doesn't exist:" + concurUser)
                }
                callback();
                
            } 
        }
    );
}

var getRole = function (concurID,  callback) {
    var options = {
        method: 'GET',
        url: concururl + '/profile/spend/v4/Users/' + concurID.ID,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        }
    };
    request(options, 
        function(error, response, body){
            if(error) {
                if(error.code == 'ECONNRESET'){
                    callback(error);
                }
            } else if(response.statusCode != 200) { 
                console.log('HTTP: ' + response.statusCode + ", user: " + concurID.name);
                callback()
            } else {
                body = JSON.parse(body);

                let rolename = ""; 
                rolename = rolename.substring(0, rolename.length-2)
                
                ConcurUserRoleDetails.push({
                    "LoginID": concurID.LoginID,
                    "ID": concurID.ID,
                    "role": rolename
                })
                callback();
            } 
        }
    );
}

function processEvent() {
    async.series([
        function(callback){
            getToken(function (err) {
                callback();
            });
        },

        function(callback){
            pageIndexes = [];
            options = {
                method: 'GET',
                url: concururl + '/users/?offset=0&limit=100&isactive=true',
                headers: {
                    'Authorization': 'Bearer ' + access_token
                }
            };
            request(options, 
                function(error, response, body){
                    if(error) {
                        callback(error);
                    } else {
                        let data = JSON.parse(body);
                        if(data.total == 0) {
                            callback('No accounts on Concur');
                        } else {
                            pageSize = Math.ceil(data.total/slackItemsPerPage);
                            for(let i=0; i<pageSize; i++) {
                                console.log(slackItemsPerPage*i)
                                pageIndexes.push(slackItemsPerPage*i);
                            }
                            callback();
                        }
                    }
                }
            );
        },

        function(callback){
            async.eachLimit(pageIndexes, maxAsync, getActiveConcurUsers, function(err){
                if(err){
                    callback(err);
                } 
                else{
                    callback();
                }
            });
        },

        function(callback) {
            async.eachLimit(ConcurUserListDetails, 3, getRole,
                function (err) {
                    fs.writeFileSync('concur_role_data_staging1.json', JSON.stringify(ConcurUserRoleDetails));
                    callback(err);
                }
            );
        }

    ],
    function(err, results) {
        console.log(err);
    });
};

processEvent();
