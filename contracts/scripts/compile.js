const fs = require('fs')
const path = require('path')
const solc = require('solc')

const CONTRACT_NAME = 'BountyEscrow'
const SOURCE_PATH = path.join(__dirname, '..', `${CONTRACT_NAME}.sol`)
const OUTPUT_DIR = path.join(__dirname, '..', 'build')

const source = fs.readFileSync(SOURCE_PATH, 'utf8')

const input = {
  language: 'Solidity',
  sources: {
    [`${CONTRACT_NAME}.sol`]: { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === 'error')
  for (const err of output.errors) console.error(err.formattedMessage)
  if (fatal.length) process.exit(1)
}

const contract = output.contracts[`${CONTRACT_NAME}.sol`][CONTRACT_NAME]

fs.mkdirSync(OUTPUT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(OUTPUT_DIR, `${CONTRACT_NAME}.json`),
  JSON.stringify(
    {
      abi: contract.abi,
      bytecode: `0x${contract.evm.bytecode.object}`,
    },
    null,
    2,
  ),
)

console.log(`compiled ${CONTRACT_NAME} -> build/${CONTRACT_NAME}.json`)
