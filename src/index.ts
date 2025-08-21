import type { Plugin } from 'vite';

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type AppscriptVitePluginType = {
    replaceFile: boolean;
    newFileName?: string;
};

export async function AppscriptVitePlugin({
    replaceFile = true,
    newFileName
}: AppscriptVitePluginType): Promise<Plugin> {
    return {
        name: 'appscript-vite-plugin',
        async writeBundle(options, bundle) {
            for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
                if (chunkOrAsset.type != 'chunk') continue;

                let code = chunkOrAsset.code;

                // find export
                const result = /export\s*{([^}]+)};/gm.exec(chunkOrAsset.code);
                const match = result && result.length > 1 ? result[1].trim() : undefined;
                if (!match) continue;

                // remove export
                code = code.replace(/export\s*{([^}]+)};/gm, '');

                // get function names
                const toReplace: Record<string, string> = {};
                const split = match.split(',');
                for (const spl of split) {
                    const t = /(.*)\s+as\s+(.*)/.exec(spl.trim());
                    if (!t || t.length < 3) continue;

                    const fn = t[1];
                    const realName = t[2];

                    // add to replace
                    toReplace[fn] = realName;
                }

                // replace only if there is something
                if (Object.keys(toReplace).length > 0) {
                    // replace functions
                    for (const entry in toReplace) {
                        // try with functions
                        const regx = RegExp(`function\\s+${escapeRegExp(entry)}\\(`);
                        code = code.replace(regx, `function ${toReplace[entry]}(`);
                        // try with arrow functions
                        const refxCst = RegExp(`const\\s+${escapeRegExp(entry)}\\s+=`);
                        code = code.replace(refxCst, `const ${toReplace[entry]} =`);
                    }

                    // create connection with old name
                    code += `// Connect internal name with function names`;
                    for (const entry in toReplace) {
                        code += `\nconst ${entry} = ${toReplace[entry]};`;
                    }
                }

                if (replaceFile) await this.fs.writeFile(`${options.dir}/${fileName}`, code);
                else {
                    const newName = newFileName ?? `modified-${fileName}`;
                    await this.fs.writeFile(`${options.dir}/${newName}`, code);
                }
            }
        }
    };
}
