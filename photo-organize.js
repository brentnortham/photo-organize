#!/usr/bin/env node

'use strict';

const program = require('commander');
const fs = require('fs-promise');
const _ = require('lodash');
const Exif = require('exif').ExifImage;
const moment = require('moment');
const q = require('q');
const winston = require('winston');
const glob = require('glob');

const validExtensions = ['jpg', 'jpeg'];

var inputDir;
var outputDir;

program
  .version('0.0.1')
  .usage('<inputDir> <outputDir> [options]')
  .option('-d, --dry', 'Do not move or copy files, but show result')
  .option('-m, --move', 'Move, instead of copy, the files')
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

winston.info(`Processing directory '${inputDir}'`);
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
  let date = null;

  fs.stat(inputDir).then(function(stat) {
    if (!stat.isDirectory()) {
      winston.error(`'${inputDir}' is not a directory`);
    }
  }, function(err) {
    winston.error(`'${inputDir}' is not valid : ${err}`);
    process.exit(1);
  });

  fs.ensureDir(outputDir)
    .then(function() {}, function(err) {
      winston.error(`'${outputDir}' is not valid : ${err}`);
      process.exit(1);
    }
  );

  if (!_.endsWith(inputDir, '/')) {
    inputDir += '/';
  }

  if (!_.endsWith(outputDir, '/')) {
    outputDir += '/';
  }

  fs.readdir(inputDir).then(function(files) {
    _.forEach(_.filter(files, validFile), function(file) {
      getDateFromExif(file)
        .then(function(exifDate) {
          if (exifDate != null && exifDate.isValid()) {
            date = exifDate;
          } else {
            date = moment(fs.statSync(inputDir + file).mtime);
          }

          let subdirectoryName = date.format('YYYY_MM_DD') + '/';
          let origFilePath = inputDir + file;
          let newFilePath = outputDir + subdirectoryName + file;
          if (!program.dry) {

            fs.stat(newFilePath).then(function(stats) {
              if (!stats.isFile()) {
                if (!program.move) {
                  fs.copy(origFilePath, newFilePath);
                } else {
                  fs.rename(origFilePath, newFilePath);
                }
              } else {
                winston.warn(`Cannot move or copy file ${origFilePath} to ${newFilePath} because the filename already exists`);
              }
            }, function(err) {
              winston.debug(err);
            });
            if (!program.move) {
              fs.copy(origFilePath, newFilePath);
            } else {
              fs.rename(origFilePath, newFilePath);
            }
          }

          console.log(`${inputDir + file} -> ${outputDir + subdirectoryName + file}`);
        }, function(err) {
          winston.error(err);
        })
        .then(null, function(err) {
          winston.trace(err);
        });
    });
  }, function(err) {
    winston.error(err);
  });
}

/**
 * Get the date of the picture from the exif data.
 *
 * @param {Object} file the file to read
 * @return {promise|*|Q.promise}
 */
function getDateFromExif(file) {
  var deferred = q.defer();
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
  let extension = file.substring(file.lastIndexOf('.') + 1); //+ 1 because we do not want the dot
  return _.includes(validExtensions, extension.toLowerCase());
}
