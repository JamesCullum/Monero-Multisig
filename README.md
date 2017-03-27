# Monero Multisig
> This git is actively managed. Feel free to create pull requests.
> Donations are appreciated at donate@monero-merchants.com

This website is a donation-based open-source service that allows users to use multisignature wallets in Monero today, even though the protocol doesn't allow this yet and probably won't for quite some time. Please consider donating to keep this service running.

### How does it work?

All participants of a multisignature wallet use this website to join the same lobby together and generate a multisignature wallet. During this generation ceremony, the server will create a secret key **km** for every participant and the seeds **sn** of hundreds of wallets. Those seeds are then XOR'd with a provided size of pairs of keys, so that for a wallet with a size of two it is **kx ? ky ? sn**. The result of those pairs are called pads **pn** and, if later combined with the keys, will XOR to the correct seed, like **sn = kx ? ky ? pn**. After the generation ceremony, every user can download a file that includes a unique session ID, his key and all of the pads he needs to restore every wallet.

### How safe is it?

The seeds are created on the server to prevent any party accessing it before a restoration ceremony took place. It needs to be known to at least one entity to create the address and viewkey without leaking the private spendkey. To reduce the impact of an attacker stealing the seed from memory, the wallets are created and always treated in batches of hundreds. Due to slow blockchain scanning in Monero and the huge amount of wallets that would need to be scanned regularily to track changes, this makes an attack highly unfeasible, especially for a low-budget donation-based service like this one. The most likely attack scenario is one of the participants, knowing the wallet that's been agreed upon, attempting to steal other users keys via malware and social engineering.

### Credits

Cryptographic JS Library by [xmr.llcoins.net](https://xmr.llcoins.net/)  
[Explaination Avatars](https://www.iconfinder.com/iconsets/user-avatars-1) by [UserInsights](https://usersinsights.com/) [(CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/)