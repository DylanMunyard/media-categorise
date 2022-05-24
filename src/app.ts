import * as fs from 'fs';
import ptn, { Tv, Movie } from 'parse-torrent-name';
import yargs from 'yargs';
import * as path from 'path';
import { exec, ExecException } from 'child_process';
import { match } from 'assert';

/* Execute a shell command and wrap the std outs in a promise */
let shell = (cmd: string) : Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        console.log(cmd);
        exec(cmd, (error: ExecException | null, stdout: string, stderr: string) => {
            if (error || stderr) {
                reject(error?.message ?? stderr);
            } else {
                resolve(stdout);
            }
        });
    });
}

let glob = (dir: string, pattern: RegExp) : Promise<string[]> => {
    return new Promise<string[]>((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) {
                reject(err.message);
            } else {
                resolve(files.filter(value => pattern.test(value)));
            }
        });
    });
}

const argv = 
yargs(process.argv.slice(2))
.options({
    srcdir: { alias: 'sd', type: 'string', demandOption: true, desc: 'The source folder to copy from' },
    src: { alias: 'f', type: 'string', demandOption: true, desc: 'The item to copy (file or folder)' },
    staging: { alias: 'd', type: 'string', default: '/media/toshiba4tb/staging', demandOption: true, desc: 'Target folder' }
})
.help()
.parseSync();

let src = path.join(argv.srcdir, argv.src);
let dest = path.join(argv.staging, argv.src);

shell(`rm -rf '${dest}' && cp -r '${src}' '${dest}'`)
.catch((reason: string) => {
    console.error(`Copying ${src} to ${dest} failed: ${reason}`);
    process.exit();
})
.then(_ => {
    // Look for rar files
    return glob(dest, /\.rar$/);
})
.catch((reason: string) => {
    console.error(`Looking for .rar file in ${dest} failed: ${reason}`); 
    process.exit();
})
.then((files) => {
    let filesArray = files as string[];
    if (filesArray && filesArray.length > 0) {
        // A rar exists to extract
        return Promise.resolve(path.join(dest, filesArray[0]));
    }

    // Nothing to extract
    return Promise.resolve("");
})
.then(rarFile => {
    if (rarFile) {
        return shell(`unrar e '${rarFile}' '${dest}' && rm -rf '${dest}/'*.r*`);
    } else {
        Promise.resolve("");
    } 
})
.catch((reason: string) => {
    console.error(`Extracting removing .rar files failed: ${reason}`);
    process.exit();
})
.then(_ => {
    let details = ptn(argv.src);

    // Clear every after season number: expecting <Title> s01 | <Title> s02-s03 | <Title> Season 1
    let seasonMatch = details.title.match(/s(?<short>\d{1,2}).*|season (?<long>\d{1,2}).*/i);
    if (seasonMatch) {
        const { "short": shortSeason, "long": longSeason } = seasonMatch.groups as { [key: string]: string };
        (details as Tv).season = parseInt(shortSeason ?? longSeason, 10);
    }
    
    details.title = details.title.replace(/s\d{1,2}.*/i, "");
    details.title = details.title.replace(/season \d{1,2}.*/i, "");
    
    // Clear year numbers from the end of the title: expecting <Title> 2021
    details.title = details.title.replace(/\d{4}$/i, "");
    
    // Remove excess whitespace
    details.title = details.title.trim();
    
    let library = "/media/server";
    let tv = details as Tv;
    let movie = details as Movie;
    let mv_cmd = '';
    if (tv.season) {
        library = `${library}/tv`;
        if (tv.episode) {
            mv_cmd = `mkdir -p '${library}/${tv.title}/Season 0${tv.season}' && mv '${dest}/'* '${library}/${tv.title}/Season 0${tv.season}/'`;
        } else {
            mv_cmd = `mv '${dest}' '${library}/${tv.title}/Season 0${tv.season}'`;
        }
    } else {
        library = `${library}/movies`;
        mv_cmd = `mv '${dest}' '${library}/${movie.title}'`;
    }

    shell(mv_cmd)
    .catch((reason: string) => {
        console.error(`Moving source to media library failed: ${reason}`);
        process.exit();
    });
}); 
