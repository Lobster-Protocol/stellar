SUBDIRS := contracts/factory contracts/multihop contracts/pool contracts/pool_stable contracts/stake contracts/token contracts/vesting packages/phoenix packages/decimal packages/curve
BUILD_FLAGS ?=
#CCFDSQDSDIQZWDHFOAB5ND3W5UTAIPM6HZOJWDPL7YUKL5BGUTCVUJVG
# Variables
CONTRACT_ID = CCXIYVIZBHOYXIG5HNXDSIKQDQI3AGLG4P2FPR4GCVQNP6MX7DJ5A5ZD
FACTORY_ID = CBHIDOTHSNV2V2MOZE45VHU6RGAGQ5UVLEVXS756NLP2I5LYAMVYEOPX
TOKEN_ID = CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
SOURCE_ACCOUNT = alice2
NETWORK = testnet
ADMIN = alice2
RESERVE = GBGCUKKP6NNBFXRH53OADNJ5BXPGXDZPI3O6EZTRZZGQGFAE57NAGW6Y
APP_NAME_HEX = e9181ff69be9793965680ae5a8b4f35c69e9047f915c4977f6bae14609ab73e4 # Hex of 32-byte name
CREATOR_ADDRESS= alice2


default: build, deploy

all: test

build:
	@for dir in $(SUBDIRS) ; do \
		$(MAKE) -C $$dir build BUILD_FLAGS=$(BUILD_FLAGS) || exit 1; \
	done

test: build
	@for dir in $(SUBDIRS) ; do \
		$(MAKE) -C $$dir test BUILD_FLAGS=$(BUILD_FLAGS) || exit 1; \
	done

fmt:
	@for dir in $(SUBDIRS) ; do \
		$(MAKE) -C $$dir fmt || exit 1; \
	done

lints: fmt
	@for dir in contracts/multihop contracts/pool ; do \
		$(MAKE) -C $$dir build || exit 1; \
	done
	@for dir in $(SUBDIRS) ; do \
		$(MAKE) -C $$dir clippy || exit 1; \
	done

clean:
	@for dir in $(SUBDIRS) ; do \
		$(MAKE) -C $$dir clean || exit 1; \
	done

make install:
	stellar contract build && \
	wasm-opt -Oz target/wasm32v1-none/release/lobster_contract.wasm -o target/wasm32v1-none/release/lobster_contract_optimized.wasm && \
	soroban contract install \
    --wasm target/wasm32v1-none/release/lobster_contract_optimized.wasm \
    --source $(SOURCE_ACCOUNT) \
    --network $(NETWORK)



deploy:
	stellar contract build && \
	wasm-opt -Oz target/wasm32v1-none/release/lobster_contract.wasm -o target/wasm32v1-none/release/lobster_contract_optimized.wasm && \
	soroban contract deploy \
    --wasm target/wasm32v1-none/release/lobster_contract.wasm \
    --source $(SOURCE_ACCOUNT) \
    --network $(NETWORK) \
	-- \
	--owner $(SOURCE_ACCOUNT) \
	--multisig CB7562EGV5GN7LQTTL3SGZX7QV4TWETXKSPWJPHT4ERM544J3AM62I6B \
	--token0 CC6NSWYCKFHKYMNREP4TCKWXP22A3LAO77AE4ZBPPUYUXCPLDOZYAHA4 \
	--token1 CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \
	--fee_cut_bps 1000

deploy_factory:
	stellar contract build
	soroban contract deploy \
    --wasm target/wasm32v1-none/release/lobster_factory.wasm \
    --source $(SOURCE_ACCOUNT) \
    --network $(NETWORK) \
	-- \
	--admin $(SOURCE_ACCOUNT) \
	--wasm_hash '[0, 233, 133, 187, 204, 45, 252, 74, 146, 104, 67, 91, 11, 161, 181, 194, 212, 7, 90, 23, 116, 179, 212, 135, 194, 143, 128, 58, 157, 43, 120, 72]' \
	--fee_bps 1000

deploy_token:
	stellar contract build
	soroban contract deploy \
    --wasm target/wasm32v1-none/release/soroban_token_contract.wasm \
    --source $(SOURCE_ACCOUNT) \
    --network $(NETWORK) \
	-- \
	--admin $(SOURCE_ACCOUNT) \
	--decimal 7 \
	--name "Lobster" \
	--symbol "LOB"

# Alternative version that's more robust
deploy-auto:
	@echo "Deploying contract..."
	@DEPLOY_OUTPUT=$$(soroban contract deploy \
		--wasm target/wasm32v1-none/release/lobster_contract.wasm \
		--source alice2 \
		--network testnet 2>&1) && \
	CONTRACT_ID=$$(echo "$$DEPLOY_OUTPUT" | grep -o 'C[A-Z0-9]\{55\}' | tail -1) && \
	echo "Deployed contract: $$CONTRACT_ID" && \
	sed -i "s/CONTRACT_ID = CAZLDDJN7CLNYUDJDKEYUNBEXLIX7TN6FCJI3JDG7AYNCRW4F5NJCUMM
	echo "Updated CONTRACT_ID in Makefile"


make soroswap:
	make initialize \
	make deposit \
	make add_liquidity_soroswap

make phoenix:
	make initializephoenix \
	make deposit \
	make add_liquidity_phoenix

initialize_factory:
	stellar contract invoke \
		--id $(FACTORY_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		initialize \
		--admin $(SOURCE_ACCOUNT) \
		--wasm_hash '[115, 205, 157, 165, 124, 13, 87, 8, 129, 67, 23, 60, 21, 115, 226, 152, 157, 73, 29, 130, 230, 156, 140, 111, 138, 2, 191, 6, 21, 7, 207, 186]' \
		--fee_bps 1000


initialize:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		__constructor \
		--owner $(SOURCE_ACCOUNT) \
		--multisig CB7562EGV5GN7LQTTL3SGZX7QV4TWETXKSPWJPHT4ERM544J3AM62I6B \
		--token0 CC6NSWYCKFHKYMNREP4TCKWXP22A3LAO77AE4ZBPPUYUXCPLDOZYAHA4 \
		--token1 CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \
		--fee_cut_bps 1000

initializephoenix:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		init \
		--owner $(SOURCE_ACCOUNT) \
		--multisig CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token0  CBZI3HVJFRUPVGOCPJIW6ILY5EGUL6LJH3UEQOBE7A2T4EKYDVBZMHOR \
		--token1 CCJGOJNPWQXBW55JZYSRUHJR6PUTDCW3NPEAFCW7U4HKGWIBXGE7IE7X \
		--fee_cut_bps 1000


initialize_aquarius:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		init \
		--owner $(SOURCE_ACCOUNT) \
		--multisig CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token0  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token1 CB72BTTFJG5AXECFYEAORTIJHM7NE562WC2BJRWJEBW76UA4RDDZVTYI \
		--fee_cut_bps 1000

deposit:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		deposit \
		--caller $(SOURCE_ACCOUNT) \
		--amount0 10000000 \
		--amount1 10000000


approve_for_deposit:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		approve_for_deposit \
		--caller $(SOURCE_ACCOUNT) \
		--amount0 100000000000000 \
		--amount1 100000000000000 \
		--expiration_ledger 3110400

approve_for_add_liquidity:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		approve_for_add_liquidity \
		--caller $(SOURCE_ACCOUNT) \
		--pool_address CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \
		--expiration_ledger 3110400


add_liquidity_soroswap:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		add_liquidity_soroswap \
		--caller $(SOURCE_ACCOUNT) \
		--amount0 6000000 \
		--amount1 6000000 \
		--amount0_min 0 \
		--amount1_min 0 \
		--deadline_ledger 99999999999 \
		--router_address CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \

add_liquidity_phoenix:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		add_liquidity_phoenix \
		--caller $(SOURCE_ACCOUNT) \
		--amount0 5000 \
		--amount1 1600 \
		--amount0_min 5 \
		--amount1_min 5 \
		--pool_address CABLJTVFD3WECRDAYBI3WQU4E66RK5WNMD7T2UMFIBL4ISLGXRRTCB3R \
		--deadline 99999999999 \
		--slippage 500 \

add_liquidity_aquarius:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		add_liquidity_aquarius \
		--caller $(SOURCE_ACCOUNT) \
		--amount0 100000 \
		--amount1 100000 \
		--pool_address CD6J56LNQZIZQCH2X6PCX4VSROIK2IDL3MIVPB3AQXN7XLMKQ36L7Q5P \


withdraw_soroswap:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		withdraw_soroswap \
		--caller $(SOURCE_ACCOUNT) \
		--amount0_min 0 \
		--amount1_min 0 \
		--deadline 99999999999 \
		--pool_address CAVZH2HGFC2MFEPEG34U6MU6APFS5AS6SQ7YUZAYNPT2LQNFLR2B4NQ3 \
		--router_address CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \

get_lp_soroswap:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_lp_soroswap \


withdraw_phoenix:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		withdraw_phoenix \
		--caller $(SOURCE_ACCOUNT) \
		--amount_lp 100 \
		--amount0_min 5 \
		--amount1_min 5 \
		--pool_address CABLJTVFD3WECRDAYBI3WQU4E66RK5WNMD7T2UMFIBL4ISLGXRRTCB3R \
		--deadline 99999999999 \
		--auto_unstake true \


withdraw_aquarius:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		withdraw_aquarius \
		--caller $(SOURCE_ACCOUNT) \
		--amount_lp 100 \
		--amount0_min 0 \
		--amount1_min 0 \
		--pool_address CD6J56LNQZIZQCH2X6PCX4VSROIK2IDL3MIVPB3AQXN7XLMKQ36L7Q5P \

get_liquidity_phoenix:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_liquidity_phoenix \
		--amount0 5000 \
		--amount1 1600 \
		--amount0_min 5 \
		--amount1_min 5 \
		--pool_address CABLJTVFD3WECRDAYBI3WQU4E66RK5WNMD7T2UMFIBL4ISLGXRRTCB3R \


add_to_pool:
	stellar contract invoke \
		--id CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		add_liquidity \
		--token_a CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token_b CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \
		--amount_a_desired 1000000000 \
		--amount_b_desired 5000000000 \
		--amount_a_min 5 \
		--amount_b_min 5 \
		--to $(SOURCE_ACCOUNT) \
		--deadline 99999999999



get_allowance:
	stellar contract invoke \
		--id CDF3IUM3237OQJ3BIM27R5H7NJVUUZNGHECKTEK2CSUQQQPJJAY7G4LT \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		allowance \
		--from $(CONTRACT_ID) \
		--spender CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4




emit_add_pool:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		emit_add_pool \
		--token CDQWFZRG5VFGT5FI2UBVL333PSSUTBY4GJMMBAJXQAAAX6ZICBBCV5X2 \
		--nexttoken CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \


emit_trade:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		emit_trade \
		--user CDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCQI2W \
		--token_in CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token_out CDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCQI2W

add_phoenix_liquidity:
	stellar contract invoke \
		--id CBW6PPCXSPOYVQAMWGEC5C2DHVYVGEPTNTC6IWO7QO7WCFJXDXNTMTXJ \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		provide_liquidity \
		--sender $(SOURCE_ACCOUNT) \
		--desired_a 5000000000 \
		--min_a 5 \
		--desired_b 1000000000 \
		--min_b 5 \
		--auto_stake true 

balance_of:
	stellar contract invoke \
		--id CDJC7NYJXEFQGC5GROJAXQZPXGNCQ6M6GLBNAIBQ27O25ESM4VPNW6AS \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		balance \
		--id CDCLXPJFLORYWP4YWQHEVLBRJ7NCFJ655IY3VACEMQKMDUP64U7HGQXX

get_pool_address:
	stellar contract invoke \
		--id CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		router_pair_for \
		--token_a CDF3IUM3237OQJ3BIM27R5H7NJVUUZNGHECKTEK2CSUQQQPJJAY7G4LT\
		--token_b CCWHNLNACQX7KI25D62GZI23MLMOWRBVT5VWCRCWSBCDRAJVRACNLNHL \

token_tvl:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_token_tvl \
		--amount0 5000 \
		--amount1 5000 \
		--pool_address CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \
		--protocol_tvl 0

get_factory_address:
	stellar contract invoke \
		--id CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4 \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_factory \

fees_enabled:
	stellar contract invoke \
		--id CCVFGQXMZ5DUFP25SCBSNOWNNMJ4ZPWPJ2KWOXT6F7ISQPRRRXGRDUPO \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		fees_enabled \
		# --token_a CC6NSWYCKFHKYMNREP4TCKWXP22A3LAO77AE4ZBPPUYUXCPLDOZYAHA4 \
		# --token_b CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \



deposit_aquarius:
	stellar contract invoke \
		--id CBBNDGG22VIMIKF2RKDGLNJR7BJSTJ6CFNXVEGHIG7REZ3ZKLJZ2ETIL \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		deposit \
		--user $(SOURCE_ACCOUNT) \
		--desired_amounts '["5000000000","1000000000"]' \
		--min_shares 0

swap_aquarius:
	stellar contract invoke \
		--id CD3LFMMLBQ6RBJUD3Z2LFDFE6544WDRMWHEZYPI5YDVESYRSO2TT32BX \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		swap \
		--user $(SOURCE_ACCOUNT) \
		--in_idx 0 \
		--out_idx 1 \
		--in_amount 1000 \
		--out_min 0

create_pool:
	stellar contract invoke \
		--id $(FACTORY_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		create_pool \
		--user $(SOURCE_ACCOUNT) \
		--token0 CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token1 CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \


get_wasm_hash:
	stellar contract invoke \
		--id $(FACTORY_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_wasm_hash

get_pool_count:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_pool_count


get_pool_by_id:
	stellar contract invoke \
		--id CCNOZIGOYOKLLKNA6KRNUVFZA6I457KODDFTEMC33JBO75IXGL7CYHHJ \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_pool_by_id \
		--id 3

change_wasm: 
	stellar contract invoke \
		--id $(FACTORY_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		set_wasm_hash \
		--wasm_hash '[183, 25, 172, 235, 69, 22, 195, 90, 214, 8, 95, 19, 130, 231, 173, 209, 143, 252, 85, 128, 107, 100, 156, 237, 245, 113, 249, 12, 125, 185, 169, 74]'



bindings:
	soroban contract bindings typescript \
  	--rpc-url https://soroban-testnet.stellar.org/ \
  	--network-passphrase "Test SDF Network ; September 2015" \
  	--contract-id $(CONTRACT_ID) \
	--output-dir ../Bindings \
  	--overwrite

bindings_factory:
	soroban contract bindings typescript \
  	--rpc-url https://soroban-testnet.stellar.org/ \
  	--network-passphrase "Test SDF Network ; September 2015" \
  	--contract-id $(FACTORY_ID) \
	--output-dir ../BindingsFac \
  	--overwrite

bindings_tokens:
	soroban contract bindings typescript \
  	--rpc-url https://soroban-testnet.stellar.org/ \
  	--network-passphrase "Test SDF Network ; September 2015" \
  	--contract-id 'CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5' \
	--output-dir ../BindingsTokens \
  	--overwrite

get_active_protocol:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_active_protocol

get_amounts_from_soroswap:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		get_amounts_from_soroswap \
		--pool_address CAVZH2HGFC2MFEPEG34U6MU6APFS5AS6SQ7YUZAYNPT2LQNFLR2B4NQ3

migrate_pool:	
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		migrate_pool \
		--caller $(SOURCE_ACCOUNT) \
		--target_pool 0 \
		--pool_addresses '{"soroswap_pool": "CAVZH2HGFC2MFEPEG34U6MU6APFS5AS6SQ7YUZAYNPT2LQNFLR2B4NQ3", "soroswap_router": "CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4", "aquarius_pool": "CD6J56LNQZIZQCH2X6PCX4VSROIK2IDL3MIVPB3AQXN7XLMKQ36L7Q5P", "phoenix_pool": "CABLJTVFD3WECRDAYBI3WQU4E66RK5WNMD7T2UMFIBL4ISLGXRRTCB3R"}' \
		--withdraw_params '{"amount0_min": "0", "amount1_min": "0", "deadline": 99999999999, "auto_unstake": false, "amount_lp": "0"}' \
		--add_liquidity_params '{"amount0": "900000", "amount1": "900000", "amount0_min": "0", "amount1_min": "0", "deadline": 99999999999, "slippage": '500'}'



create_pair_soroswap:
	stellar contract invoke \
		--id CCVFGQXMZ5DUFP25SCBSNOWNNMJ4ZPWPJ2KWOXT6F7ISQPRRRXGRDUPO \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		create_pair \
		--token_a CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
		--token_b CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5 \

create_pair_phoenix:
	stellar contract invoke \
		--id CBIFTP5CLUIVIVJ7WAMGOQPYPCV3CH3AVMHNWIL5XDPYCRWLBPUWL7FI \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		create_liquidity_pool \
		--sender $(SOURCE_ACCOUNT) \
		--lp_init_info '{ "admin": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL", "swap_fee_bps": 1000, "fee_recipient": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL", "max_allowed_slippage_bps": 10000, "default_slippage_bps": 3000, "max_allowed_spread_bps": 10000, "max_referral_bps": 5000, "token_init_info": { "token_b": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "token_a": "CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5" }, "stake_init_info": { "min_bond": "100", "min_reward": "100", "manager": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL", "max_complexity": 7 } }' \
		--default_slippage_bps 3000 \
		--max_allowed_fee_bps 10000 \
		--share_token_name "PPP" \
		--share_token_symbol "POOL" \
		--pool_type 0


create_pair_aquarius:
	stellar contract invoke \
		--id CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		init_standard_pool \
		--user $(SOURCE_ACCOUNT) \
		--tokens '["CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5", "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"]' \
		--fee_fraction 30
