// ═══════════════════════════════════════════════════════════════════════════
//  SpscRingBuffer.h — wait-free single-producer / single-consumer queue
//
//  This is the only channel between the PortAudio realtime thread (producer)
//  and the game loop (consumer). It never allocates, never blocks and never
//  takes a lock, so a slow frame on the render thread can stall the game but
//  can never cause an audio dropout — the producer simply drops a frame and
//  bumps a counter.
//
//  Contract: EXACTLY one producer thread and EXACTLY one consumer thread.
//  Both indices are plain size_t counters masked into the slot array; the
//  release/acquire pair on write_/read_ publishes the slot contents.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <type_traits>

namespace fretless::core {

// Hardcoded rather than std::hardware_destructive_interference_size: GCC warns
// that the latter is ABI-unstable, and 64 is correct on every target we ship.
inline constexpr std::size_t kCacheLineSize = 64;

template <typename T, std::size_t Capacity>
class SpscRingBuffer {
    static_assert(std::is_trivially_copyable_v<T>,
                  "T crosses a thread boundary in a realtime context: it must be "
                  "a POD. No std::string, no owning pointers, no destructors.");
    static_assert(std::is_default_constructible_v<T>);
    static_assert(Capacity >= 2 && (Capacity & (Capacity - 1)) == 0,
                  "Capacity must be a power of two (the index wrap is a mask).");
    static_assert(std::atomic<std::size_t>::is_always_lock_free,
                  "Platform cannot provide a lock-free size_t atomic.");

public:
    /// One slot is always kept empty to disambiguate full from empty.
    static constexpr std::size_t capacity() noexcept { return Capacity - 1; }

    /// Producer side. Realtime-safe. Returns false when the queue is full;
    /// the caller decides whether to drop the sample or overwrite.
    [[nodiscard]] bool push(const T& value) noexcept {
        const std::size_t w    = write_.load(std::memory_order_relaxed);
        const std::size_t next = (w + 1) & kMask;
        if (next == read_.load(std::memory_order_acquire)) {
            return false;                       // full
        }
        slots_[w] = value;
        write_.store(next, std::memory_order_release);
        return true;
    }

    /// Consumer side. Realtime-safe. Returns false when the queue is empty.
    [[nodiscard]] bool pop(T& out) noexcept {
        const std::size_t r = read_.load(std::memory_order_relaxed);
        if (r == write_.load(std::memory_order_acquire)) {
            return false;                       // empty
        }
        out = slots_[r];
        read_.store((r + 1) & kMask, std::memory_order_release);
        return true;
    }

    /// Consumer side. Drains up to `max` items into `dst`, returns the count.
    [[nodiscard]] std::size_t popBatch(T* dst, std::size_t max) noexcept {
        std::size_t n = 0;
        while (n < max && pop(dst[n])) {
            ++n;
        }
        return n;
    }

    [[nodiscard]] bool empty() const noexcept {
        return read_.load(std::memory_order_acquire) ==
               write_.load(std::memory_order_acquire);
    }

    /// Approximate — the other thread may move an index while we read it.
    /// Diagnostics only; never branch on this in the audio path.
    [[nodiscard]] std::size_t sizeApprox() const noexcept {
        const std::size_t w = write_.load(std::memory_order_acquire);
        const std::size_t r = read_.load(std::memory_order_acquire);
        return (w - r) & kMask;
    }

    /// Only legal while both threads are stopped.
    void reset() noexcept {
        write_.store(0, std::memory_order_relaxed);
        read_.store(0, std::memory_order_relaxed);
    }

private:
    static constexpr std::size_t kMask = Capacity - 1;

    // The two indices live on separate cache lines: sharing one would make
    // every producer store invalidate the consumer's line (false sharing),
    // which is exactly the kind of stall that shows up as a click at 3 ms
    // buffer sizes. The padding MSVC warns about (C4324) is the entire point.
#if defined(_MSC_VER)
    #pragma warning(push)
    #pragma warning(disable : 4324)   // structure padded due to alignas
#endif
    alignas(kCacheLineSize) std::atomic<std::size_t> write_{0};
    alignas(kCacheLineSize) std::atomic<std::size_t> read_{0};
    alignas(kCacheLineSize) std::array<T, Capacity>  slots_{};
#if defined(_MSC_VER)
    #pragma warning(pop)
#endif
};

}  // namespace fretless::core
