#include <atomic>
#include <thread>
#include <vector>

#include "TestHarness.h"
#include "fretless/core/SpscRingBuffer.h"

using fretless::core::SpscRingBuffer;

namespace {
struct Payload {
    int      value = 0;
    double   stamp = 0.0;
    std::uint64_t index = 0;
};
}  // namespace

TEST(ring_buffer_reports_empty_when_new) {
    SpscRingBuffer<Payload, 8> queue;
    CHECK(queue.empty());
    Payload out;
    CHECK(!queue.pop(out));
    CHECK_EQ(queue.capacity(), std::size_t{7});
}

TEST(ring_buffer_preserves_order) {
    SpscRingBuffer<Payload, 8> queue;
    for (int i = 0; i < 7; ++i) {
        CHECK(queue.push({i, 0.0, 0}));
    }
    for (int i = 0; i < 7; ++i) {
        Payload out;
        CHECK(queue.pop(out));
        CHECK_EQ(out.value, i);
    }
    CHECK(queue.empty());
}

TEST(ring_buffer_refuses_push_when_full) {
    SpscRingBuffer<Payload, 4> queue;
    CHECK(queue.push({1, 0.0, 0}));
    CHECK(queue.push({2, 0.0, 0}));
    CHECK(queue.push({3, 0.0, 0}));
    // One slot is reserved to tell full from empty, so the fourth fails.
    CHECK(!queue.push({4, 0.0, 0}));

    Payload out;
    CHECK(queue.pop(out));
    CHECK_EQ(out.value, 1);
    CHECK(queue.push({4, 0.0, 0}));   // space freed
}

TEST(ring_buffer_wraps_around_many_times) {
    SpscRingBuffer<Payload, 4> queue;
    Payload out;
    for (int i = 0; i < 1000; ++i) {
        CHECK(queue.push({i, 0.0, 0}));
        CHECK(queue.pop(out));
        CHECK_EQ(out.value, i);
    }
}

TEST(ring_buffer_pop_batch_drains_available) {
    SpscRingBuffer<Payload, 16> queue;
    for (int i = 0; i < 5; ++i) {
        CHECK(queue.push({i, 0.0, 0}));
    }
    Payload batch[16];
    CHECK_EQ(queue.popBatch(batch, 16), std::size_t{5});
    CHECK_EQ(batch[0].value, 0);
    CHECK_EQ(batch[4].value, 4);
    CHECK(queue.empty());
}

// The whole point of the structure: a producer that never blocks and a
// consumer that never sees a torn or out-of-order item.
#if !defined(__EMSCRIPTEN__) || defined(__EMSCRIPTEN_PTHREADS__)
TEST(ring_buffer_is_correct_under_concurrent_producer_and_consumer) {
    constexpr int kItems = 200000;
    SpscRingBuffer<Payload, 256> queue;
    std::atomic<bool> producerDone{false};
    std::atomic<int>  dropped{0};

    std::thread producer([&] {
        for (int i = 0; i < kItems; ++i) {
            Payload item{i, static_cast<double>(i) * 0.5,
                         static_cast<std::uint64_t>(i)};
            while (!queue.push(item)) {
                // A real audio thread drops instead of spinning; here we want
                // every item to arrive so the ordering assertion is total.
                std::this_thread::yield();
            }
        }
        producerDone.store(true, std::memory_order_release);
    });

    int      received = 0;
    int      outOfOrder = 0;
    int      corrupted = 0;
    Payload  item;
    while (received < kItems) {
        if (queue.pop(item)) {
            if (item.value != received) {
                ++outOfOrder;
            }
            // A torn read would show fields that disagree with each other.
            if (item.stamp != static_cast<double>(item.value) * 0.5 ||
                item.index != static_cast<std::uint64_t>(item.value)) {
                ++corrupted;
            }
            ++received;
        } else if (producerDone.load(std::memory_order_acquire) && queue.empty()) {
            break;
        }
    }
    producer.join();

    CHECK_EQ(received, kItems);
    CHECK_EQ(outOfOrder, 0);
    CHECK_EQ(corrupted, 0);
    CHECK_EQ(dropped.load(), 0);
}
#endif
