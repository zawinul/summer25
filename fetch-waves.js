let start = "https://api.github.com/repos/TheSmallTeaBoi/the-libre-sample-pack/contents/"
let arr = [];
async function scanDir(dirUrl, pref) {
	let j = await fetch(dirUrl).then(r=>r.json());
	for(let i=0;i<j.length; i++) {
		let item = j[i];
		if (item.type == 'dir') {
			await scanDir(item.url, pref + item.name + '/');
		}
		if (item.type=='file')
			arr.push([pref, item.name, item.download_url]);
	}
	return 'ok';
}

async function main() {
	await scanDir(start, '');
	console.log(JSON.stringify(arr, null, '\t'));
}
main().then(()=>
	console.log, console.log);