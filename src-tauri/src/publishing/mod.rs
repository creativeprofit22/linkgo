//! Unified LinkedIn publishing execution for posts and comments.
//!
//! Manual commands and the scheduler both call [`service::execute`]. See
//! `docs/features/publishing-execution.md` for the state machine, the LinkedIn
//! contract and operator recovery.

pub mod recovery;
pub mod service;
pub mod store;
pub mod transport;
pub mod types;

#[cfg(test)]
#[path = "publishing_tests.rs"]
mod tests;
