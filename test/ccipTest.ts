import { ethers } from "hardhat";
import { expect } from "chai";
import {
    CCIPLocalSimulator,
    CrossChainNameServiceLookup,
    CrossChainNameServiceLookup__factory,
    CrossChainNameServiceReceiver,
    CrossChainNameServiceReceiver__factory,
    CrossChainNameServiceRegister,
    CrossChainNameServiceRegister__factory,
} from "../typechain-types";
import { Signer } from "ethers";

describe("CCIP", () => {
    let localSimulator: CCIPLocalSimulator;
    let ccnsLookup: CrossChainNameServiceLookup;
    let ccnsLookup2: CrossChainNameServiceLookup;
    let ccnsReceiver: CrossChainNameServiceReceiver;
    let ccnsRegister: CrossChainNameServiceRegister;

    before(async () => {
        const localSimulatorFactory = await ethers.getContractFactory("CCIPLocalSimulator");
        localSimulator = await localSimulatorFactory.deploy();
        await localSimulator.deployed();
        const config = await localSimulator.configuration();

        const ccnsLookupFactory: CrossChainNameServiceLookup__factory = await ethers.getContractFactory("CrossChainNameServiceLookup");
        ccnsLookup = await ccnsLookupFactory.deploy();
        await ccnsLookup.deployed();
        ccnsLookup2 = await ccnsLookupFactory.deploy();
        await ccnsLookup2.deployed();

        // src-chain
        const ccnsRegisterFactory: CrossChainNameServiceRegister__factory = await ethers.getContractFactory("CrossChainNameServiceRegister");
        ccnsRegister = await ccnsRegisterFactory.deploy(config.sourceRouter_, ccnsLookup2.address);
        await ccnsRegister.deployed();

        // dst-chain
        const ccnsReceiverFactory: CrossChainNameServiceReceiver__factory = await ethers.getContractFactory("CrossChainNameServiceReceiver");
        ccnsReceiver = await ccnsReceiverFactory.deploy(config.destinationRouter_, ccnsLookup.address, config.chainSelector_);
        await ccnsReceiver.deployed();

        // link the dst-receiver addr to the dst-lookup service
        let res = await ccnsLookup.setCrossChainNameServiceAddress(ccnsReceiver.address);
        await res.wait();
        // link the src-register addr to the src-lookup service
        res = await ccnsLookup2.setCrossChainNameServiceAddress(ccnsRegister.address);
        await res.wait();

        res = await ccnsRegister.enableChain(config.chainSelector_, ccnsReceiver.address, 500_000n);
        await res.wait();

        console.log("All setup done");
    });

    it("The alice's name should arrive the dst and src chain's lookup table", async function () {
        let alice: Signer;
        [, alice] = await ethers.getSigners();

        // register alice 's name on the src-register contract
        let res = await ccnsRegister.connect(alice).register("alice.ccns");
        await res.wait();

        // look up alice.ccns
        const dstCCNS = await ccnsLookup.lookup("alice.ccns");
        expect(dstCCNS).to.equal(await alice.getAddress());
        const srcCCNS = await ccnsLookup2.lookup("alice.ccns");
        expect(srcCCNS).to.equal(await alice.getAddress());
    });
});
