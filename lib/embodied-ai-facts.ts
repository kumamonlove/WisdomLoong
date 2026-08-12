export type EmbodiedAiFact = {
  name: string;
  fact: string;
  profile: string;
  source: string;
  sourceUrl: string;
};

// Keep every entry attributable to a university, research lab, professional
// society, or established publication. The UI links the source on each card.
export const embodiedAiFacts: EmbodiedAiFact[] = [
  {
    name: "Marc Raibert",
    fact: "他早期最著名的机器人只有一条腿，必须持续跳跃才能保持平衡；这种“动态稳定”思路后来贯穿了 Boston Dynamics 的腿式机器人。",
    profile: "Boston Dynamics 创始人，曾在 CMU 和 MIT 建立腿式机器人实验室，领导开发 BigDog、Spot 和 Atlas。",
    source: "Boston Dynamics",
    sourceUrl: "https://bostondynamics.com/about/",
  },
  {
    name: "Cynthia Breazeal",
    fact: "早在二十多年前，她就让机器人 Kismet 通过眼睛、眉毛、耳朵和语调与人进行带情绪线索的交流。",
    profile: "MIT 教授、社交机器人先驱，研究人与机器人之间的交流、学习和长期关系。",
    source: "MIT Media Lab",
    sourceUrl: "https://www.media.mit.edu/people/cynthiab/overview/",
  },
  {
    name: "Oussama Khatib",
    fact: "他领导的水下人形机器人 OceanOne 通过触觉反馈，让船上的操作者能够感知深海遗物的接触力。",
    profile: "Stanford 教授，操作空间控制、人机协作、触觉与水下机器人领域的代表人物。",
    source: "Stanford",
    sourceUrl: "https://profiles.stanford.edu/oussama-khatib",
  },
  {
    name: "Takeo Kanade（金出武雄）",
    fact: "他参与领导的 Navlab 自动驾驶实验在 1995 年横穿美国，约 98% 的路段由车辆自主转向。",
    profile: "CMU 计算机视觉与机器人先驱，研究横跨视觉、自动驾驶、医疗机器人和无人飞行器。",
    source: "Carnegie Mellon University",
    sourceUrl: "https://www.ri.cmu.edu/ri-faculty/takeo-kanade/",
  },
  {
    name: "Rodney Brooks",
    fact: "他用论文标题《Elephants Don’t Play Chess》质疑只重抽象推理的传统 AI，主张智能应从感知和行动中生长。",
    profile: "MIT 机器人学家，包容式架构提出者，联合创办 iRobot 和 Rethink Robotics。",
    source: "MIT CSAIL",
    sourceUrl: "https://people.csail.mit.edu/brooks/",
  },
  {
    name: "Daniela Rus",
    fact: "她的团队做过能折叠、自组装、游动和像软体动物一样移动的机器人，把“机器人必须是硬壳机器”变成了过时印象。",
    profile: "MIT CSAIL 主任，研究分布式、模块化、软体机器人与自主系统。",
    source: "MIT CSAIL",
    sourceUrl: "https://www.csail.mit.edu/person/daniela-rus",
  },
  {
    name: "Pieter Abbeel",
    fact: "他的团队曾让机器人通过观察人类演示学会叠毛巾；后来又让机器人用深度强化学习掌握此前没有明确编程的操作技能。",
    profile: "UC Berkeley 教授、BAIR 联合主任，也是 Covariant 和 Gradescope 的联合创始人。",
    source: "UC Berkeley",
    sourceUrl: "https://people.eecs.berkeley.edu/~pabbeel/",
  },
  {
    name: "Sergey Levine",
    fact: "他推动机器人从大量试错和视觉输入中直接学习动作，让“端到端机器人学习”成为现代具身智能的重要路线。",
    profile: "UC Berkeley 教授，研究深度强化学习、控制和机器人自主学习。",
    source: "UC Berkeley",
    sourceUrl: "https://people.eecs.berkeley.edu/~svlevine/",
  },
  {
    name: "Chelsea Finn",
    fact: "她参与提出的 MAML 让模型学习“如何快速学习”，使机器人能用很少的新示例适应新任务。",
    profile: "Stanford 教授，研究机器人学习、元学习和能够持续适应的智能体。",
    source: "Stanford",
    sourceUrl: "https://profiles.stanford.edu/chelsea-finn",
  },
  {
    name: "Fei-Fei Li（李飞飞）",
    fact: "ImageNet 最初需要把数以百万计的图片组织成可训练数据；这项看似“整理图片”的工程后来显著推动了视觉识别，也奠定了机器人视觉的重要基础。",
    profile: "Stanford 教授、HAI 联合主任，长期研究计算机视觉、具身智能和以人为本的 AI。",
    source: "Stanford HAI",
    sourceUrl: "https://hai.stanford.edu/people/fei-fei-li",
  },
  {
    name: "Dieter Fox",
    fact: "他把概率推断用于机器人定位和环境理解，并参与把家用机器人需要的感知与导航能力推向真实产品。",
    profile: "University of Washington 教授、NVIDIA 机器人研究负责人，研究机器人感知、定位和操作。",
    source: "University of Washington",
    sourceUrl: "https://homes.cs.washington.edu/~fox/",
  },
  {
    name: "Vijay Kumar",
    fact: "他的实验室让一群微型四旋翼在室内高速编队、穿越狭窄空间，展示了小型机器人群体协作的惊人精度。",
    profile: "University of Pennsylvania 教授，研究无人机、机器人群体、控制与自主系统。",
    source: "Penn Engineering",
    sourceUrl: "https://www.seas.upenn.edu/~kumar/",
  },
  {
    name: "Ruzena Bajcsy",
    fact: "她很早就提出“主动感知”：机器人不应只被动接收图像，而要主动移动传感器来理解世界。",
    profile: "UC Berkeley 教授，机器人视觉、主动感知和人机协作领域的奠基者之一。",
    source: "UC Berkeley EECS",
    sourceUrl: "https://www2.eecs.berkeley.edu/Faculty/Homepages/bajcsy.html",
  },
  {
    name: "Hiroshi Ishiguro（石黑浩）",
    fact: "为了研究人与机器交流，他制造了与自己外貌高度相似的机器人分身 Geminoid HI，并让它代替自己远程出席活动。",
    profile: "大阪大学教授，长期研究仿真人、远程存在和人类存在感。",
    source: "Osaka University IRL",
    sourceUrl: "https://www.irl.sys.es.osaka-u.ac.jp/",
  },
  {
    name: "Masahiro Mori（森政弘）",
    fact: "影响机器人、电影和游戏设计的“恐怖谷”，最初来自他在 1970 年发表的一篇很短的文章。",
    profile: "日本机器人学家，研究工业自动化、人机关系与机器人教育，也是 Robocon 的重要推动者。",
    source: "IEEE Spectrum",
    sourceUrl: "https://spectrum.ieee.org/the-uncanny-valley",
  },
  {
    name: "Maja Matarić",
    fact: "她从研究机器人群体协作转向社会辅助机器人，让机器人通过陪伴和鼓励帮助中风患者训练、支持儿童学习。",
    profile: "USC 教授，群体机器人和社会辅助机器人领域的开拓者。",
    source: "USC Viterbi",
    sourceUrl: "https://viterbi.usc.edu/directory/faculty/Mataric/Maja",
  },
  {
    name: "Ken Goldberg",
    fact: "他一边研究机器人抓取和云机器人，另一边也是艺术家；其装置与网络艺术作品曾进入博物馆展览。",
    profile: "UC Berkeley 教授，研究机器人操作、自动化、手术机器人与人机协作。",
    source: "UC Berkeley",
    sourceUrl: "https://goldberg.berkeley.edu/",
  },
  {
    name: "Shuran Song（宋舒然）",
    fact: "她在 Google Brain 参与开发 TossingBot，让机器人学会：有些物体不必慢慢摆放，直接扔进目标箱反而更高效。",
    profile: "Stanford 教授，研究三维视觉、机器人操作和具身场景理解。",
    source: "Stanford",
    sourceUrl: "https://shurans.github.io/",
  },
  {
    name: "Deepak Pathak",
    fact: "他的代表性研究让智能体因为“好奇”而探索环境，即使外界没有提供明确任务奖励，也会主动寻找新体验。",
    profile: "CMU 教授、Skild AI 联合创始人，研究自监督学习、强化学习和机器人基础模型。",
    source: "Carnegie Mellon University",
    sourceUrl: "https://www.cs.cmu.edu/~dpathak/",
  },
  {
    name: "Anca Dragan",
    fact: "她研究机器人怎样让人看懂自己的意图，因为数学上最短的动作，不一定是与人协作时最清楚、最让人安心的动作。",
    profile: "UC Berkeley 教授，研究人机协作、意图推断、奖励学习与 AI 对齐。",
    source: "UC Berkeley",
    sourceUrl: "https://people.eecs.berkeley.edu/~anca/",
  },
  {
    name: "Yann LeCun",
    fact: "他曾用蛋糕比喻机器学习：自监督学习是蛋糕本体，监督学习是糖霜，强化学习只是顶部的樱桃。",
    profile: "卷积神经网络的重要开拓者，与 Geoffrey Hinton、Yoshua Bengio 共同获得 2018 年图灵奖。",
    source: "ACM",
    sourceUrl: "https://awards.acm.org/award-recipients/lecun_6017366",
  },
  {
    name: "李泽湘",
    fact: "他把高校研究、珠三角供应链和创业孵化连接起来，形成了一套影响深远的硬科技创业培养模式。",
    profile: "香港科技大学教授，研究运动控制、机器人和智能制造，也是大疆早期投资人与 XbotPark 发起人。",
    source: "XbotPark",
    sourceUrl: "https://xbotpark.com/",
  },
  {
    name: "王兴兴",
    fact: "学生时代，他为完成四足机器人 XDog 主动延后毕业；这个个人项目后来成为其机器人创业道路的重要起点。",
    profile: "宇树科技创始人兼 CEO，长期从事四足与人形机器人本体、运动控制和产品化。",
    source: "Unitree Robotics",
    sourceUrl: "https://www.unitree.com/",
  },
  {
    name: "朱松纯",
    fact: "他的研究把视觉、认知、语言和机器人放进同一框架，试图让机器不仅识别像素，还能理解场景中的因果与意图。",
    profile: "北京通用人工智能研究院院长，曾任 UCLA 教授，研究通用人工智能、认知科学和机器人。",
    source: "BIGAI",
    sourceUrl: "https://www.bigai.ai/",
  },
  {
    name: "乔红",
    fact: "她长期研究机器人“手—眼—脑”协同，希望机器人能像人一样把视觉理解、触觉反馈和精细操作连成闭环。",
    profile: "中国科学院院士、自动化研究所研究员，研究仿生感知、灵巧操作与机器人智能。",
    source: "Chinese Academy of Sciences",
    sourceUrl: "https://people.ucas.ac.cn/~qiaohong",
  },
];
