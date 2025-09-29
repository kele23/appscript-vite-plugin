import type { Plugin } from 'vite';

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type AppscriptVitePluginType = {
    replaceFile: boolean;
    libName?: string;
    banner?: string;
    newFileName?: string;
};

export async function AppscriptVitePlugin({
    replaceFile = true,
    libName = 'APP',
    banner,
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
                const fnNames: string[] = [];
                const split = match.split(',');
                for (const spl of split) {
                    const name = spl.trim();
                    const t = /(.*)\s+as\s+(.*)/.exec(name);
                    if (t) {
                        const fn = t[1];
                        const realName = t[2];
                        toReplace[fn] = realName;
                        fnNames.push(realName);
                    } else {
                        fnNames.push(name);
                    }
                }

                // replace only if there is something to replace
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

                // isolate code into a LIB Section
                code = `/**\n* @ignore\n* @hidden\n* @private\n*/\nconst ${libName} = (() => {\n\n${code}\n\nreturn {\n  ${fnNames.join(',\n  ')}\n}\n\n})();\n\n`;
                for (const fnName of fnNames) {
                    code += `const ${fnName} = ${libName}.${fnName};\n`;
                }

                // add banner on top
                if (banner) {
                    code = banner + '\n\n' + code;
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
