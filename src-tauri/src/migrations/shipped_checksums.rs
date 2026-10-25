//! Pins the SQL of every shipped migration.
//!
//! sqlx stores each applied migration's checksum in `_sqlx_migrations`; if a
//! shipped migration's SQL changes, existing user databases fail to boot. This
//! test catches that in CI instead. When you add a new migration, append its
//! `(version, checksum)` pair from the failure message. Never change an
//! existing pair: write a new migration instead.

const SHIPPED: &[(i64, &str)] = &[
    (1, "52d43b4e846984e7b832b414a0be827823195c89657c739d494696ec19e36796135bbff8b76697b6d36de36a7c07b4e0"),
    (2, "6f22225672db20188a90008b5e0fd46d379ae8930f2943f7975ba7b03bc40da56f814d7154a84d923e8243eb152542c5"),
    (3, "7ffa872da370d7dbad7f133c523372532a615eba81d849332b2698f70648fb8493695397f19e41fdb6791e6a9b10173c"),
    (4, "1e5ecb250e9eb34932f727b2740b47a0a08057c1db30952ddedf73e719d76636ff58f16617c52e90c443f3851bf4d131"),
    (5, "de6f57ce997e08728bff9f71cc3ad31b45687616dacc4ca78b43c87aa6a8e8294e906cbd328e71818b3b054342446847"),
    (6, "db35614c2f94afd14e4c0fe4cd87403a09d2addaa7d490004dffc20025880d1c13bc29ff0d3e56df356190c25552fd80"),
    (7, "e539e7888c0bf45c03bfee4b034d84b12c6927d91e8b2d84eea23417814ff13d7887ca9cbc2e7d2d8a7582524b61a5c9"),
    (8, "eb261512f15e13f4b9ff8cb17bee1d4f78778cb21e130000e1350e8de532968cfd8a77a6bf86615e1e2e0c546c0df73c"),
    (9, "0972ec01b4692634175be87e023709215769fe5d8186fe24d3fa55b3d5438ded279107da771a223298d9069394b25b46"),
    (10, "60d97f73072c532a37dcf2d231061c7f6698b42bc40e0be09ef8039826e1331fdef68ee99592f54dd9ef28dce6a03f6f"),
    (11, "1c612fadfd5756cd13b1380556be8a9ad4403ab0524945be789dc9549748d661b6cbaf188fa4045b087d6c9375cc1918"),
    (12, "1764a473e1aa04e462ec86a1533ef9526391f7c37db133139a27c6a785c205c0e06a4fda12031ddf906d6cdcb02e1958"),
    (13, "a016e9bce601aa2e46440b243289d9138fe0a3c7daf62f4f39cadf306fd3e90312cab3b50d6faa1a017a0688743e2a23"),
    (14, "d73bb4645d4e84beab77f0ba7b8d4614626c56f32e4151a3a3c60c69635fc4ab70cb9eb34ff8b891f904b956f4d909fb"),
    (15, "938f1994405d19896a02aed2563ff3945f9383db514c1067ec904577c202b7a96ec5c012ab98b6e55627b6b249dfc55e"),
    (16, "5a16ff63ef8419a38c25393ea60b6ef147bd42f789bd7cafda8769892a360bd3156a57439ff3af7818da8690967e5b5b"),
    (17, "d48fd11f47a14017dedb828eec0b5ed9a991f82efcfcce8d8062ce5ea22435d3a1eb72f3f50574a71dc3755dc0425a53"),
    (18, "6988b8a3bef82a7e9b0227106f09abd7fd9011a1b2f3d1250734131a7a96d6c43c4a1317a601c0ff9e0120c49a6882d5"),
    (19, "5bc0d48a5d2706a6c9120e4f8016b349ed2bcee7839628d90f2e585f14fdfe7cf9bc41657273a583c5b786d9acb0cf61"),
    (20, "0d2e7f0f72d577d889500550f3746d14f38b8b664003e0657015bbafc19ed24b88777aaae7ba47146812f36215066188"),
    (21, "cb72ba7e1cab67d016de7e84597d6fd72edc96004ac8219e695b6eae9a62e3ddbd02e983fb28146657793ff8b32f0518"),
    (22, "45a0065ced90a4ee020f32030f129b4f20e7072211aa7d6d4d2ca874726a0274ffc8ec968cc98a4c782da0c90c94f017"),
    (23, "130f9d2aeaa9192ad206cceb59fbaa4d3bcd382678f2e1f0f04371461938b3a59681351b2d325e3710079f44ec23d769"),
    (24, "b7d283d19365d1b687d05c95d69f26a4e88406861600a04cef06c2cf216d4fe817f833449457a532726eba9fb3ff0a1a"),
    (25, "aa44d4ede50981c200a7509d0f57af9334a78bdde6900a854248a042a6b9aeebfd41137658f49e0d07418d2bbc81870e"),
    (26, "5015dc40fdfc94177c9ccff8a25d9b1fbb21240fde52e39a5f87ba6fb4831a7b0c25c02cd391684773832c3c1b1e664f"),
    (27, "1f18f5c562b3dd44527296fb84e577c99ec7ee77e7fcc391a76dcc8d0be286fb1887e062c757c86754099701209b62f8"),
    (28, "1e089f476286ef97d379ea823e1b8c5a618d9a229e1bd259c735bba0d2f4e62517c0f053923310284ca2f3878d1386bc"),
    (29, "19b64041726cd2d341ba4902dd216376a2ae8f63f7b41282c33d92398e294f4104bbe846671bab83e0e86a16500bd94f"),
    (30, "2ed537f89affcfecad1fbee4af8f1ac98478668bc826ce8fad04029e2ab79e1a6f4386e0b530e390c816e90cca35e208"),
    (31, "66fc68df272fe6fa794a413ff17c62a78d536d2ccfb9d8e558b1e6ec98ecd0cc2cf521f246399ab1f998018c55d1bb6a"),
    (32, "29b6d6020ae7bf6daaa311d7e861003a704d19ae83129e37ec4b0883d10312977268b7f6997c6695d39350284f6c7bdd"),
    (33, "e3c36ce8b0a641af3099cf08c8f9631d24fce0bce65716b9ab42e1d0aea21841ba59a80ec01b23610404b4ed195a8c74"),
    (34, "45260ec898a94eada77f778d71693ad112548b43ef3b6b38b7f587d695fe53d51a6e0179940488f8d41a2641404ebb44"),
    (35, "91978557d9846739b99969c2a9d4087437abcb96bdd3ae120ce28c2c730fb77fba8a9c84ed3e534e00b894fd3c41b0d7"),
    (36, "efe40a1d48d89e332df6f0e92af7564ce0381fbe9fa12661b27e4ca6a80a5a1cb85f1fe77f9f7e4cb5514dc6c2871407"),
    (37, "644271f9a0601259ea70ea1a2c1766c1ee364befaeeba19e87d7fd2733c71f439934cd95b747af781b87babbeb2e1977"),
    (38, "c8d0e11860f6ea710fbb30f724a4c92306503ff3218691cfa433a373233b87ab483a92db6aba0c88aee425125797ecea"),
    (39, "20e26d407fc9aeb73dd65a209334e0c30a8d552e9eeb22b834180da47a440389eb6b1662bdf048374c1b3799e44525b2"),
    (40, "9f8b81c6e78e6bdc4b618dd78c17cce36a374148ce6a7bf426f007503b29df0f21c4137fcb11023c59b6dbcf348af155"),
];

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn shipped_migrations_are_unchanged() {
    let actual: Vec<(i64, String)> = super::sqlx_migrator()
        .iter()
        .map(|migration| (migration.version, hex(&migration.checksum)))
        .collect();
    let listing: String = actual
        .iter()
        .map(|(version, checksum)| format!("    ({version}, \"{checksum}\"),\n"))
        .collect();

    for (version, expected) in SHIPPED {
        let found = actual.iter().find(|(v, _)| v == version);
        let Some((_, checksum)) = found else {
            panic!("shipped migration {version} was removed; migrations are forward-only");
        };
        assert_eq!(
            checksum, expected,
            "shipped migration {version} changed; existing databases would fail to boot. \
             Revert it and add a new migration instead."
        );
    }
    let unpinned: Vec<i64> = actual
        .iter()
        .filter(|(version, _)| !SHIPPED.iter().any(|(v, _)| v == version))
        .map(|(version, _)| *version)
        .collect();
    assert!(
        unpinned.is_empty(),
        "migrations {unpinned:?} are not pinned; add them to SHIPPED. Current list:\n{listing}"
    );
}
