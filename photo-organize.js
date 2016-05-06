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
const path = require('path');
const recursive = require('recursive-readdir');

const validExtensions = ['.jpg', '.jpeg'];

var inputDir;
var outputDir;

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

  fs.stat(inputDir)
    .then(function(stat) {
      if (!stat.isDirectory()) {
        winston.error(`'${inputDir}' is not a directory`);
      }
    })
    .catch(function(err) {
    winston.error(`'${inputDir}' is not valid : ${err}`);
    process.exit(1);
  });

  fs.ensureDir(outputDir)
    .catch(function(err) {
      winston.error(`'${outputDir}' is not valid : ${err}`);
      process.exit(1);
    }
  );

  if (program.recursive) {
    recursive(inputDir, function(err, files) {
      if (err) {
        winston.error(err);
      }
      processFiles(files);
    });
  } else {
    fs.readdir(inputDir)
      .then(function(files) {
        processFiles(_.map(files, function(file) {
          return path.join(inputDir, file);
        }));
      })
    .catch(function(err) {
        winston.error(err);
      });
  }
}

function processFiles(files) {
  _.forEach(_.filter(files, validFile), function(file) {
    getDateFromExif(file)
      .then(function(exifDate) {
        let origFilePath = path.resolve(file);
        let date;

        if (exifDate != null && exifDate.isValid()) {
          date = exifDate;
        } else {
          date = moment(fs.statSync(origFilePath).mtime);
        }

        let datePath = path.join(date.year().toString(),  (date.month() + 1).toString() + ' - ' + moment.months()[date.month()]);
        let newFilePath = path.join(outputDir, datePath, path.basename(origFilePath));
        if (!program.dry) {
          fs.stat(newFilePath)
            .then(function(stats) {
              winston.warn(`Cannot move or copy file ${origFilePath} to ${newFilePath} because the filename already exists`);
            })
            .catch(function(err) {
              if (!program.move) {
                fs.copy(origFilePath, newFilePath)
                .then(function() {
                  winston.info(`${origFilePath} copied to ${newFilePath}`);
                })
                .catch(function(err) {
                  winston.error(`Error copying ${origFilePath}: ${err}`);
                });
              } else {
                fs.rename(origFilePath, newFilePath)
                  .then(function() {
                    winston.error(`${origFilePath} moved to ${newFilePath}`);
                  })
                  .catch(function(err) {
                    winston.log(`Error moving ${origFilePath}: ${err}`);
                  });
              }
            });
        }

      })
        .catch(function(err) {
        winston.debug(err);
      });
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
  let extension = path.extname(file);
  return _.includes(validExtensions, extension.toLowerCase());
}
