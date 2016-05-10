#!/usr/bin/env node

'use strict';

const program = require('commander');
const fs = require('fs-promise');
const _ = require('lodash');
const Exif = require('exif').ExifImage;
const moment = require('moment');
const q = require('q');
const Promise = require('promise');
const winston = require('winston');
const path = require('path');
const recursive = require('recursive-readdir');

const validExtensions = ['.jpg', '.jpeg'];

var inputDir;
var outputDir;

winston.info(process.argv);

program
  .version('0.0.1')
  .usage('<inputDir> <outputDir> [options]')
  .option('-d, --dry', 'Do not move or copy files, but show result')
  .option('-m, --move', 'Move, instead of copy, the files')
  .option('-R, --recursive', 'Recurse the inputDir')
  .option('-v, --verbose', 'Increase chattiness')
  .parse(process.argv);

if (program.args.length > 2) {
  winston.error('Too many arguments.');
  process.exit(1);
} else {
  inputDir = program.args[0] || process.cwd();
  outputDir = program.args[1] || 'out';
}

if (program.verbose) {
  winston.level = 'debug';
}

if (program.dry) {
  winston.info('Dry option specified. File will not be output.');
}

processInput(inputDir, outputDir);

/**
 * Process a directory : list files, get timestamp and move them to appropriate subdirectory.
 *
 * @param {String} inputDir the glob expression specifying the files to process
 */
function processInput(inputDir, outputDir) {

  let readdir = fs.readdir;

  if (program.recursive) {
    readdir = Promise.denodeify(recursive);
  }

  fs.stat(inputDir)
    .then(function(stat) {
      if (!stat.isDirectory()) {
        winston.error(`'${inputDir}' is not a directory`);
      }
    })
    .then(function() {
      fs.ensureDir(outputDir);
    })
    .then(function() {
      fs.readdir(inputDir);
    })
    .then(function(files) {
      perform(files);
    })
    .then(function(messages) {
      winston.info('Done');
      winston.info(messages);
    })
    .done()
    .catch(function(err) {
      winston.error(`'${inputDir}' is not valid : ${err}`);
      process.exit(1);
    });
}

function perform(files) {
  return Promise.all(files.filter(validFile).forEach(process));
}

function process(image) {
  getDateFromExif(image)
    .then(function(exifDate) {
      let origFilePath = path.resolve(image);
      let newFilePath = getNewFilePath(origFilePath, exifDate);

      if (!program.dry) {
        fs.stat(newFilePath)
          .then(function() {
            let warnMsg = `Cannot move or copy file ${origFilePath} to ${newFilePath} because the filename already exists`;
            winston.warn(warnMsg);
            return Promise.resolve(warnMsg);
          }, function() {
            if (!program.move) {
              fs.copy(origFilePath, newFilePath)
              .then(function() {
                winston.info(`${origFilePath} copied to ${newFilePath}`);
                return Promise.resolve(image);
              }, function(err) {
                let errMsg = `Error copying ${origFilePath}: ${err}`;
                winston.error(errMsg);
                return Promise.reject(errMsg);
              });
            } else {
              fs.rename(origFilePath, newFilePath)
                .then(function() {
                  winston.info(`${origFilePath} moved to ${newFilePath}`);
                  return Promise.resolve(image);
                }, function(err) {
                  let errMsg = `Error moving ${origFilePath}: ${err}`;
                  winston.error(errMsg);
                  return Promise.reject(errMsg);
                });
            }
          })
            .catch(function(err) {});
      }
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
}

function getNewFilePath(origFilePath, exifDate) {
  let date;

  if (exifDate !== null && exifDate.isValid()) {
    date = exifDate;
  } else {
    date = moment(fs.statSync(origFilePath).mtime);
  }

  let datePath = path.join(date.year().toString(), (date.month() + 1).toString() + ' - ' + moment.months()[date.month()]);
  return path.join(outputDir, datePath, path.basename(origFilePath));
}

/**
 * Get the date of the picture from the exif data.
 *
 * @param {Object} file the file to read
 * @return {promise|*|Q.promise}
 */
function getDateFromExif(file) {

  try {
    new Exif({
      image: inputDir + file
    }, function(error, exifData) {
      if (error) {
        deferred.resolve(null);

        return;
      }
      let dateString;

      if (exifData.exif.DateTimeOriginal !== undefined) {
        dateString = exifData.exif.DateTimeOriginal;
      } else if (exifData.exif.DateTime !== undefined) {
        dateString = exifData.exif.DateTime;
      }
      deferred.resolve(moment(dateString, 'YYYY:MM:DD HH:mm:ss'));
    });
  } catch (err) {
    deferred.reject(`Error: ${err}`);
  }

  return deferred.promise;
}

/**
 * @param {Object} file the file to process
 * @return {Boolean} true if the file is valid for processing, false otherwise
 */
function validFile(file) {
  let extension = path.extname(file);

  return _.includes(validExtensions, extension.toLowerCase());
}
