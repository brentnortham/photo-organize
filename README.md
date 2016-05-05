# photo-organize
photo-organize is a tool to organize photographs into subdirectories based on exif date.
If no EXIF date is found, the file date is used.

For example, I use it to quickly move all my phones pictures to subdirectories named after the date YYY-MM-DD.
For this particular purpose, a day starts at 5am. This way late evening pictures belongs to the correct event day.

# Install

> npm install -g "brentnortham/photo-organize"

# Usage

> photo-organize [inputDir] [outputDir] [--dry]

If the __inputDir__ is not provided, the current working directory is used.
The __--dry__ option logs the changes without applying them.

# Sources

https://github.com/brentnortham/photo-organize
