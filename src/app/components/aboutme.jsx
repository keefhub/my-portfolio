"use client";

import { motion } from "framer-motion";
import Image from "next/image"; // Using Next.js Image for optimization

export default function AboutMe() {
  return (
    <section id="about" className="py-16">
      <div className="max-w-6xl mx-auto px-4 flex flex-col-reverse md:flex-row items-center gap-12">
        {/* Text Content */}
        <motion.div
          className="md:w-1/2 text-center md:text-left"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl font-bold text-[#333] mb-4">About Me</h2>
          <p className="text-[#555] leading-relaxed">
            Software engineer by profession, but a plant lover, coffee
            enthusiast, and someone who enjoys taking photos.
          </p>
          <p className="text-[#555] leading-relaxed">
            Whether it's learning new technologies or cracking jokes, or
            figuring out why my code's not working or what my plant is thinking.
            I find joy solving problems no matter how little, whether it's
            tucked inside lines of code or deep under potting soil.
          </p>
          <p className="text-[#555] leading-relaxed">
            Oh yes, and my name is Keith or Keef if you'd prefer
          </p>
        </motion.div>

        {/* Image */}
        <motion.div
          className="md:w-1/2 flex justify-center"
          initial={{ opacity: 0, y: -50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="rounded-2xl overflow-hidden shadow-xl w-64 h-64 relative">
            <Image
              src="/profile/placeholder.jpg"
              alt="Keith Lim"
              layout="fill"
              objectFit="cover"
              className="rounded-2xl"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
