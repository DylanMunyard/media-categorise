import * as fs from 'fs';
import ptn, { Tv, Movie } from 'parse-torrent-name';
import yargs from 'yargs';
import * as path from 'path';
import { exec, ExecException } from 'child_process';

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

/* Return files from directory matching pattern */
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
    staging: { alias: 'd', type: 'string', default: '/media/seagate5tb/staging', demandOption: true, desc: 'Target folder' },
    library: { alias: 'l', type: 'string', default: '/media/seagate5tb/plex', demandOption: true, desc: 'Library folder' },
    usenet: { type: 'boolean', default: false, demandOption: false, desc: 'Source from Usenet' }
})
.help()
.parseSync();

let src = path.join(argv.srcdir, argv.src);
let dest = path.join(argv.staging, argv.src);
let sourceUsenet = argv.usenet;
let sourceCopy = `${(sourceUsenet ? `mv '${src}' '${argv.staging}'` : `cp -r '${src}' '${dest}'`)}`;

shell(`rm -rf '${dest}' && ${sourceCopy}`)
.catch((reason: string) => {
    console.error(`Error ${sourceCopy}: ${reason}`);
    process.exit();
})
.then(_ => {
    return new Promise<string[]>((resolve, reject) => {
        fs.lstat(dest, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            if (stats.isDirectory()) {
                // Look for rar files
                glob(dest, /\.rar$/).then(resolve).catch(reject);
            } else {
                resolve([]);
            }
        });
    });
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
        // Extract the archive
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
    // parse the file name
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

    let is_dir : boolean = fs.lstatSync(dest).isDirectory();
    let tv = details as Tv;
    let movie = details as Movie;
    let mv_cmd : string;
    if (tv.episode && !tv.season) {
        // Episode without season number, assume season 1
        tv.season = 1;
    }
    if (tv.season) {
        argv.library = `${argv.library}/tv`;
        if (tv.episode) {
            // For torrents move the contents, for usenet move the folder, for files move the file
            let source = `'${dest}/'*`;
            if (sourceUsenet || !is_dir) {
                source = `'${dest}'`;
            }
            mv_cmd = `mkdir -p '${argv.library}/${tv.title}/Season 0${tv.season}' && mv ${source} '${argv.library}/${tv.title}/Season 0${tv.season}/'`;
        } else {
            mv_cmd = `mkdir -p '${argv.library}/${tv.title}/Season 0${tv.season}' && mv '${dest}' '${argv.library}/${tv.title}/Season 0${tv.season}'`;
        }
    } else {
        argv.library = `${argv.library}/movies`;
        mv_cmd = `mv '${dest}' '${argv.library}/${movie.title}'`;
    }

    shell(mv_cmd)
    .catch((reason: string) => {
        console.error(`Moving source to media library failed: ${reason}`);
        process.exit();
    });
}); 
